-- Fix contacts and threads named 'Você'
-- Sets their name to 'Cliente' (which is the default generic name) so they can auto-heal
-- when the lead sends the next message and provides their pushName.

-- 1. Update Threads table
UPDATE threads
SET contact_name = 'Cliente'
WHERE contact_name = 'Você';

-- 2. Update Contacts table
UPDATE contacts
SET nome = 'Cliente'
WHERE nome = 'Você';
