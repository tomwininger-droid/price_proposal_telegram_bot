// Single source of truth for the business identity baked into the served tool
// and into Claude's prompts. Defaults match the original Brands Or Not deploy,
// so an existing .env with none of these set keeps behaving exactly as before.

function getBranding(){
  return {
    businessName: process.env.BUSINESS_NAME || 'Brands Or Not',
    businessSlogan: process.env.BUSINESS_SLOGAN || 'עיצוב. חוויית משתמש. דיגיטל',
    senderName: process.env.SENDER_NAME || '',
    primaryColor: process.env.PRIMARY_COLOR || '#3B2BCB',
    bgColor: process.env.BG_COLOR || '#F4F3FA'
  };
}

module.exports = { getBranding };
