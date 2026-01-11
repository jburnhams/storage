-- Migration: Add profile_pic_blob column to users table
ALTER TABLE users ADD COLUMN profile_pic_blob BLOB;
