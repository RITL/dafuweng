const chineseDigits: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  捌: 8,
  九: 9,
};

const parseChineseToken = (token: string): number[] => {
  if (token === "十") return [10];
  if (token.includes("十")) {
    const [tens, ones] = token.split("十");
    const value = (tens ? chineseDigits[tens] : 1) * 10 + (ones ? chineseDigits[ones] : 0);
    return Number.isFinite(value) && value >= 0 && value <= 24 ? [value] : [];
  }
  return Array.from(token)
    .map((digit) => chineseDigits[digit])
    .filter((value): value is number => value !== undefined);
};

export const parseSpokenNumber = (transcript: string): number | null => {
  const speech = transcript.normalize("NFKC");
  const arabicCandidates = (speech.match(/\d+/g) ?? [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 24);
  if (arabicCandidates.length > 0) return arabicCandidates[arabicCandidates.length - 1];

  const normalized = speech
    .replace(/回答完毕|完毕|答案是|答案|一共|总共|等于|就是|应该是|应该|是|点|个|呀|啊|呢|哦|啦/g, "|")
    .replace(/[\s，。！!？?]+/g, "|")
    .replace(/俩/g, "两")
    .replace(/幺/g, "一")
    .replace(/洞/g, "零");
  const chineseCandidates = Array.from(normalized.matchAll(/[零〇一二两三四五六七八捌九十]{1,3}/g))
    .flatMap((match) => parseChineseToken(match[0]));
  if (chineseCandidates.length > 0) return chineseCandidates[chineseCandidates.length - 1];

  const shortAnswer = normalized.replace(/我说|我答|回答|\|/g, "");
  const eightAliases = new Set(["吧", "巴", "爸", "叭", "发"]);
  return eightAliases.has(shortAnswer) ? 8 : null;
};
