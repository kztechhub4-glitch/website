class PyAudio:
    def open(self, *args, **kwargs):
        return Stream()
    def terminate(self):
        pass

class Stream:
    def read(self, *args, **kwargs):
        import time
        time.sleep(0.1)
        return b'\x00' * 1024
    def stop_stream(self):
        pass
    def close(self):
        pass

paInt16 = 1
