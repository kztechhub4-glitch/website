# MarksonGlobal Store Context

## Database Schema

```sql
-- 1. Enable UUID generation extension
create extension if not exists "uuid-ossp";

-- 2. Create the Products Table
create table public.products (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    description text,
    price numeric(10, 2) not null check (price >= 0),
    section text not null, -- e.g., 'Electronics', 'Apparel', 'Groceries'
    image_url text, -- URL pointing to Supabase Storage bucket
    is_available boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Automate updated_at timestamps
create or replace function update_modified_column()
returns trigger as 10789
begin
    new.updated_at = now();
    return new;
end;
10789 language plpgsql;

create trigger update_products_modtime
    before update on public.products
    for each row
    execute procedure update_modified_column();

-- 4. Enable Row Level Security (RLS)
alter table public.products enable row level security;

-- 5. Define Security Policies (Crucial for Admin vs Customer access)
-- Policy A: Anyone (including anonymous store browsers) can read available products
create policy "Allow public read access to available products"
on public.products for select
using (true);

-- Policy B: Only authenticated users (Admins) can modify data
create policy "Allow full access to authenticated admins"
on public.products for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
```

## Storage Setup

1. Bucket: `product-images` (Public)
2. Policies:
   - Select/Read: Public (true)
   - Insert/Update/Delete: `auth.role() = 'authenticated'`
