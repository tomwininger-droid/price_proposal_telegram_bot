const { Input } = require('telegraf');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Convert Hebrew text to speech, returning an OGG/OPUS buffer that Telegram
 * accepts directly as a voice message (sendVoice) — no ffmpeg needed.
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
async function synthesize(text){
  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    input: text,
    response_format: 'opus'
  });
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Send a reply both as a text message AND as a voice message.
 * Voice failures are non-fatal — the text always goes out.
 * @param {import('telegraf').Context} ctx
 * @param {string} text
 */
async function replyVoiceAndText(ctx, text){
  await ctx.reply(text);
  try{
    const audio = await synthesize(text);
    await ctx.replyWithVoice(Input.fromBuffer(audio, 'reply.ogg'));
  }catch(err){
    console.error('TTS failed (text was still sent):', err.message);
  }
}

module.exports = { synthesize, replyVoiceAndText };
