// Per-question notes backend. Fill these in after deploying the Google
// Apps Script — see notes-backend/NOTES-SETUP.md for the walkthrough.
// Leaving endpoint blank just disables the notes feature (the button
// still shows, but saving quietly no-ops instead of erroring).
const NOTES_CONFIG = {
  endpoint: 'https://script.google.com/macros/s/AKfycbzbODQcEcYZ-oS-aOrB0q26oxRgUXsBd9edQkZPuHxqXySIwcJCD8GjGAb1CGOLX6Wq/exec', // e.g. 'https://script.google.com/macros/s/AKfycb.../exec'
  secret: 'A7_+qJv>2862'    // the same string you set as NOTES_SECRET in the script
};
