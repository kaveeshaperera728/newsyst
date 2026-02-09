
// Initialize Supabase
// REPLACE THESE WITH YOUR OWN SUPABASE CREDENTIALS
const SUPABASE_URL = 'https://wrpbexxoeuqxpryrwcxw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndycGJleHhvZXVxeHByeXJ3Y3h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwODM3MDgsImV4cCI6MjA4NTY1OTcwOH0.rx7hh5cEqXEBbYN2LwgUwt4ufEqKWjOPNxLmJpJ3Dk8';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabase;
