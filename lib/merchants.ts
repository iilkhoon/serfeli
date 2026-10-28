import localMerchants from "../docs/local-merchants.json";
export const merchantDomains = [
  "tap.az",
  "alinino.az",
  "kontakt.az",
  "irshad.az",
  "bakuelectronics.az",
  "ispace.az",
  "soliton.az",
  "birmarket.az",
  "technomania.az",
  ...localMerchants.map((s) => s.domain),
];
export const merchantLogos: Record<string, { src: string; wordmark: boolean }> = {
  kontakt: { src: "/logos/kontakt.ico", wordmark: false },
  irshad: { src: "/logos/irshad.svg", wordmark: true },
  baku: { src: "/logos/baku.svg", wordmark: false },
  ispace: { src: "/logos/ispace.png", wordmark: true },
  soliton: { src: "/logos/soliton.svg", wordmark: true },
  birmarket: { src: "/logos/birmarket-wordmark.svg", wordmark: true },
  technomania: { src: "/logos/technomania.png", wordmark: false },
};
