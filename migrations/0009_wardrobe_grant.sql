-- The owner can open the whole wardrobe for someone, as they can open the levels (worker/src/panel.ts).
ALTER TABLE grants ADD COLUMN wardrobe INTEGER NOT NULL DEFAULT 0;
