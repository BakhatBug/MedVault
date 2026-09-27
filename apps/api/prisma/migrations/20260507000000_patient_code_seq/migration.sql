-- Allocator for the public patient identifier (spec §4.1, format MVK-YYYY-NNNNN).
-- A Postgres SEQUENCE gives us atomic, contention-free, never-reused values.
-- The year + zero-padded suffix are formatted at the application layer.
CREATE SEQUENCE IF NOT EXISTS patient_code_seq START 1 INCREMENT 1 NO CYCLE;
