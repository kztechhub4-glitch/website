import os
import re
import sys
import json
import queue
import time
import sqlite3
import threading
try:
    import pyaudio
except ImportError:
    import mock_pyaudio as pyaudio
import pygame

# =====================================================================
# 1. GLOBAL SETTINGS & INTER-THREAD PIPELINES
# =====================================================================
DB_FILE = "bible.db"
audio_queue = queue.Queue()
display_queue = queue.Queue()
running = True

# Global system configurations adjustable dynamically by user interface
CURRENT_TRANSLATION = "NIV"  # Options: "KJV", "NIV", "ESV"
ENGINE_MODE = "regex"         # Options: "regex" (Speed-First) or "gemma" (Smart-Context)

# Regex compiler configuration layout matching structural phrases
VERSE_PATTERN = re.compile(
    r'(?P<book>(\d+\s*)?[a-zA-Z\s]+?)\s+(?:chapter\s+)?(?P<chapter>\d+)(?:\s+(?:verse\s+)?(?P<verse>\d+))?',
    re.IGNORECASE
)

BOOK_MAPPING = {
    "genesis": "Genesis", "exodus": "Exodus", "leviticus": "Leviticus",
    "john": "John", "1 john": "1 John", "first john": "1 John",
    "romans": "Romans", "kings": "1 Kings", "first kings": "1 Kings"
}

# =====================================================================
# 2. LOCAL MULTI-TRANSLATION DATABASE LAYER
# =====================================================================
def initialize_database():
    """Initializes a tiny local SQLite database with multi-translation support and speeds."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS verses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
            kjv_text TEXT, niv_text TEXT, esv_text TEXT
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_b_c_v ON verses (book, chapter, verse)')

    # Pre-populate sample test data targets
    cursor.execute("SELECT COUNT(*) FROM verses")
    if cursor.fetchone()[0] == 0:
        samples = [
            ("John", 3, 16,
             "For God so loved the world, that he gave his only begotten Son...",
             "For God so loved the world that he gave his one and only Son...",
             "For God so loved the world, that he gave his only Son..."),
            ("Romans", 8, 28,
             "And we know that all things work together for good to them that love God...",
             "And we know that in all things God works for the good of those who love him...",
             "And we know that for those who love God all things work together for good...")
        ]
        cursor.executemany('INSERT INTO verses (book, chapter, verse, kjv_text, niv_text, esv_text) VALUES (?,?,?,?,?,?)', samples)
        conn.commit()
    conn.close()

def query_bible_text(book, chapter, verse, translation):
    """Pulls coordinates directly in under 1ms from database file."""
    col = {"KJV": "kjv_text", "NIV": "niv_text", "ESV": "esv_text"}.get(translation.upper(), "niv_text")
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute(f"SELECT {col} FROM verses WHERE book=? AND chapter=? AND verse=?", (book, int(chapter), int(verse)))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None

# =====================================================================
# 3. THREAD 1: HARDWARE MIC AUDIO SAMPLING CAPTURE
# =====================================================================
def audio_capture_thread():
    global running
    p = pyaudio.PyAudio()
    try:
        stream = p.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=1024)
    except Exception as e:
        print(f"❌ Audio Mic Error: {e}. Check hardware connections.")
        running = False
        return

    while running:
        try:
            data = stream.read(1024, exception_on_overflow=False)
            audio_queue.put(data)
        except Exception:
            break
    stream.stop_stream()
    stream.close()
    p.terminate()

# =====================================================================
# 4. THREAD 2: TRANSCRIPTION & PARSING DUAL-ENGINE
# =====================================================================
def load_local_ai_engines():
    """Dynamically loads local model weights based on configuration preference."""
    whisper_model, gemma_model = None, None

    # Lazy imports to ensure low-VRAM machines don't instantly crash at startup
    if os.path.exists("models/base.en-int8.bin"):
        from faster_whisper import WhisperModel
        print("⚡ Loading Faster-Whisper INT8 onto GPU hardware VRAM...")
        whisper_model = WhisperModel("models/base.en-int8.bin", device="cuda", compute_type="int8")

    if ENGINE_MODE == "gemma" and os.path.exists("models/gemma-2-2b-it-Q4_K_M.gguf"):
        from llama_cpp import Llama
        print("🧠 Loading Gemma 2 2B LLM onto GPU hardware VRAM...")
        gemma_model = Llama(model_path="models/gemma-2-2b-it-Q4_K_M.gguf", n_gpu_layers=-1, n_ctx=512)

    return whisper_model, gemma_model

def run_regex_parser(text):
    """Option 1: Super ultra fast mathematical text evaluation loop."""
    text_clean = text.lower().replace("one", "1").replace("two", "2").replace("three", "3").replace("four", "4").replace("five", "5")
    matches = VERSE_PATTERN.finditer(text_clean)
    for match in matches:
        extracted_book = match.group('book').strip()
        chapter = match.group('chapter')
        verse = match.group('verse') if match.group('verse') else "1"

        for key, value in BOOK_MAPPING.items():
            if key in extracted_book:
                return value, chapter, verse
    return None

def run_gemma_parser(gemma_instance, text_buffer):
    """Option 2: Contextually smart interpretation parsing via local LLM."""
    sys_prompt = "Extract Bible verses into JSON array format: [{'book': str, 'chapter': int, 'verse': int}]. Respond ONLY with valid JSON or empty []. No talk."
    prompt = f"<start_of_turn>user\n{sys_prompt}\nText: '{text_buffer}'<end_of_turn>\n<start_of_turn>model\n"
    try:
        res = gemma_instance(prompt, max_tokens=50, temperature=0.0)
        data = json.loads(res['choices'][0]['text'].strip())
        if data and isinstance(data, list):
            item = data[0]
            return item.get("book"), item.get("chapter"), item.get("verse")
    except Exception:
        pass
    return None

def ai_processing_thread():
    global running
    whisper_engine, gemma_engine = load_local_ai_engines()
    audio_buffer = bytearray()
    last_detected_key = ""
    cooldown_until = 0

    while running:
        try:
            chunk = audio_queue.get(timeout=0.1)
            audio_buffer.extend(chunk)
        except queue.Empty:
            continue

        # Wait for roughly 1.5 seconds of audio buffer blocks
        if len(audio_buffer) >= 48000:
            raw_audio = bytes(audio_buffer)
            audio_buffer.clear()

            # Execute Local AI audio transcription step
            transcript = ""
            if whisper_engine:
                segments, _ = whisper_engine.transcribe(raw_audio, beam_size=1)
                transcript = " ".join([seg.text for seg in segments])
            else:
                # Fallback Simulation mock if engine files are missing in path
                if time.time() % 15 < 2: transcript = "Turn your bibles to John chapter 3 verse 16"

            if not transcript.strip():
                continue

            print(f"💬 Live Transcript Stream: \"{transcript}\"")

            # Parse structural text tokens using the selected configuration profile
            coords = None
            if ENGINE_MODE == "gemma" and gemma_engine:
                coords = run_gemma_parser(gemma_engine, transcript)
            else:
                coords = run_regex_parser(transcript)

            if coords:
                book, chap, vrs = coords
                current_key = f"{book} {chap}:{vrs}"

                # Check execution criteria boundary rules (Cooldown check)
                if current_key != last_detected_key or time.time() > cooldown_until:
                    text = query_bible_text(book, chap, vrs, CURRENT_TRANSLATION)
                    if text:
                        print(f"🎯 Target Found: {current_key} [{CURRENT_TRANSLATION}]")
                        display_queue.put({"citation": current_key, "text": text})
                        last_detected_key = current_key
                        cooldown_until = time.time() + 4.0  # Freeze window adjustments for 4 seconds

# =====================================================================
# 5. THREAD 3 & MAIN INTERFACE: PYGAME DUAL-MONITOR PROJECTOR
# =====================================================================
class ProjectorDisplayWindow:
    def __init__(self):
        pygame.init()
        pygame.font.init()

        # Check secondary display target locations
        num_screens = pygame.display.get_num_displays()
        self.target_screen = 1 if num_screens > 1 else 0

        # Borderless design layout settings for presentation setup overlays
        self.flags = pygame.NOFRAME | pygame.HWSURFACE | pygame.DOUBLEBUF
        self.surface = pygame.display.set_mode((0,0), self.flags, display=self.target_screen)
        self.w, self.h = self.surface.get_size()

        # UI Scaling Configurations
        self.title_font = pygame.font.SysFont("arial", int(self.h * 0.06), bold=True)
        self.verse_font = pygame.font.SysFont("georgia", int(self.h * 0.06))

        self.bg_color = (15, 23, 42)       # Slate dark fill background color context
        self.txt_color = (241, 245, 249)   # Platinum soft display text strings
        self.gold_color = (234, 179, 8)     # Bright yellow for citation references

        self.title_text = "SYSTEM ACTIVE"
        self.body_text = "AI engine listening in background. Awaiting verse mention..."
        self.redraw()

    def split_lines(self, txt, font, limit):
        words = txt.split(' ')
        lines, current = [], []
        for w in words:
            current.append(w)
            if font.size(' '.join(current))[0] > limit:
                current.pop()
                lines.append(' '.join(current))
                current = [w]
        lines.append(' '.join(current))
        return lines

    def update_view(self, citation, content):
        self.title_text = citation.upper()
        self.body_text = content
        self.redraw()

    def redraw(self):
        self.surface.fill(self.bg_color)
        padding_x = int(self.w * 0.08)
        max_w = self.w - (padding_x * 2)

        # Render top header line metadata block
        header = self.title_font.render(self.title_text, True, self.gold_color)
        self.surface.blit(header, (padding_x, int(self.h * 0.15)))

        # Render body paragraph wrap matrix arrays
        lines = self.split_lines(self.body_text, self.verse_font, max_w)
        line_h = int(self.verse_font.get_linesize() * 1.3)
        start_y = int(self.h * 0.28)
        for idx, line in enumerate(lines):
            line_surf = self.verse_font.render(line, True, self.txt_color)
            self.surface.blit(line_surf, (padding_x, start_y + (idx * line_h)))
        pygame.display.flip()

def run_application_runtime():
    global running
    initialize_database()

    # Launch structural thread routines safely in background processes context
    t1 = threading.Thread(target=audio_capture_thread, daemon=True)
    t2 = threading.Thread(target=ai_processing_thread, daemon=True)
    t1.start()
    t2.start()

    # Initialize Pygame Window layout on physical display layer
    window = ProjectorDisplayWindow()
    clock = pygame.time.Clock()
    print("\n🚀 App Running! Double-display link initialized. Press 'ESC' on screen to close down.")

    while running:
        # Capture OS window management signals to avoid execution lock hanging issues
        for event in pygame.event.get():
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False

        # Read cross-thread data updates out of Queue B channel parameters link
        try:
            new_slide = display_queue.get_nowait()
            window.update_view(new_slide["citation"], new_slide["text"])
        except queue.Empty:
            pass
        clock.tick(30) # Anchor execution speed overhead cleanly to 30 frames per second limit

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    run_application_runtime()
