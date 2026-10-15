// Local, deterministic screening. Flags mean "needs human review", not a
// finding that a customer violated policy. Rating is deliberately not an input.
export function screenReview(title:string,message:string){
  const text=`${title}\n${message}`.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').toLowerCase();
  const flags:string[]=[];
  if(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)||/(?:\+?63|0)[\s().-]*9(?:[\s().-]*\d){9}\b/.test(text)||/\b(?:\d[ -]?){13,19}\b/.test(text)||/\b\d{1,5}\s+(?:[\w.-]+\s+){0,5}(?:street|st|avenue|ave|road|rd|subdivision)\b/i.test(text))flags.push('Possible private contact, address or payment information');
  if(/(?:https?:\/\/|www\.)\S+|\b(?:buy now|click here|free money|guaranteed profit|promo code|online casino|crypto investment|vote for|political campaign)\b/i.test(text)||/(.)\1{14,}/.test(text)||/\b(\w+)(?:\s+\1){7,}\b/i.test(text)||/<\/?[a-z][^>]*>/i.test(text))flags.push('Possible spam, promotional, unrelated or embedded content');
  if(/\b(?:i(?:'ll| will| am going to)|we(?:'ll| will))\s+(?:kill|hurt|attack|shoot|stab)\b|\b(?:kill yourself|papatayin kita|sasaktan kita|susunugin ko|babarilin kita)\b/i.test(text))flags.push('Possible threat or encouragement of harm');
  if(/\b(?:you|staff|groomer|owner|employee|kayo|ikaw)\s+(?:(?:are|is|a|an|mga|ay|ang)\s+){0,3}(?:idiots?|morons?|bobo|tanga|gago)\b|\b(?:putang\s*ina\s*(?:mo|nyo|ninyo)|fuck\s+you)\b/i.test(text))flags.push('Possible targeted harassment');
  if(/\b(?:nigger|faggot|kike)\b|\b(?:all|these|those)\s+(?:muslims|christians|jews|gay people|immigrants)\s+(?:should die|must die|are animals)\b/i.test(text))flags.push('Possible hate speech');
  return {status:flags.length?'Pending' as const:'Approved' as const,reason:flags.length?`Automatic screening v1: ${flags.join('; ')}. Admin review required.`:'Automatically approved: no policy concerns detected by screening v1.'};
}
