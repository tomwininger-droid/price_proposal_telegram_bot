const fs = require('fs');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcribe a Hebrew audio file (the .ogg Telegram voice note) to text.
 * @param {string} filePath - path to the downloaded audio file
 * @returns {Promise<string>} transcript
 */
async function transcribe(filePath){
  const result = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
    language: 'he'
  });
  return (result.text || '').trim();
}

module.exports = { transcribe };
