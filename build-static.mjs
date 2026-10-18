import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const staticRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(staticRoot, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
const evaluate = (source) => Function(`"use strict"; return (${source});`)();

const objectRows = (relativePath) =>
  read(relativePath)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{ id:"))
    .map((line) => evaluate(line.replace(/,$/, "")));

const seedRows = read("app/destinations-asia-europe-extra.ts")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("seed("))
  .map((line) => {
    const args = evaluate(line.replace(/^seed\(/, "[").replace(/\),?$/, "]"));
    const [id, city, country, countryId, type, lat, lon, season, highlights, tagline] = args;
    return { id, city, country, countryId, type, lat, lon, season, highlights, tagline };
  });

const defaults = {
  自然: { days: "4—7天", budget: "¥8k—15k", accent: "#75d6a5", lead: "沿着山海、森林与旷野，读懂当地的自然尺度。" },
  人文: { days: "3—6天", budget: "¥7k—13k", accent: "#f0aa70", lead: "在街巷、遗址与日常生活之间，听见时间留下的回声。" },
  海岛: { days: "5—7天", budget: "¥9k—16k", accent: "#60e5d0", lead: "把行程交给海风、潮汐与一段缓慢的岛屿时光。" },
  城市: { days: "3—5天", budget: "¥7k—14k", accent: "#f0d46b", lead: "从清晨市场走到夜色街区，感受这座城市的真实节奏。" },
  秘境: { days: "5—8天", budget: "¥10k—18k", accent: "#9eb7ff", lead: "离开熟悉路线，在更安静的地貌与故事里停留。" },
};

const completeSeed = (seed) => ({
  ...seed,
  days: seed.days ?? defaults[seed.type].days,
  budget: seed.budget ?? defaults[seed.type].budget,
  tagline: seed.tagline ?? `去${seed.city}，${defaults[seed.type].lead}`,
  accent: defaults[seed.type].accent,
});

const destinations = [
  ...objectRows("app/destinations.ts"),
  ...objectRows("app/destinations-africa-americas-extra.ts").map(completeSeed),
  ...seedRows.map(completeSeed),
  ...objectRows("app/destinations-oceania-extra.ts").map(completeSeed),
];

if (destinations.length !== 600) {
  throw new Error(`Expected 600 destinations, found ${destinations.length}`);
}

const countryNames = Object.fromEntries(
  destinations.map((destination) => [destination.countryId, destination.country]),
);
Object.assign(countryNames, {
  "004": "阿富汗",
  "010": "南极洲",
  "086": "英属印度洋领土",
  "092": "英属维尔京群岛",
  "108": "布隆迪",
  "140": "中非共和国",
  "148": "乍得",
  "158": "中国",
  "174": "科摩罗",
  "180": "刚果民主共和国",
  "232": "厄立特里亚",
  "238": "福克兰群岛（马尔维纳斯）",
  "239": "南乔治亚岛和南桑德韦奇岛",
  "248": "奥兰群岛",
  "260": "法属南方领地",
  "332": "海地",
  "334": "赫德岛和麦克唐纳岛",
  "408": "朝鲜民主主义人民共和国",
  "434": "利比亚",
  "478": "毛里塔尼亚",
  "500": "蒙特塞拉特",
  "534": "圣马丁（荷属）",
  "562": "尼日尔",
  "566": "尼日利亚",
  "600": "巴拉圭",
  "624": "几内亚比绍",
  "652": "圣巴泰勒米",
  "654": "圣赫勒拿",
  "659": "圣基茨和尼维斯",
  "660": "安圭拉",
  "663": "圣马丁（法属）",
  "666": "圣皮埃尔和密克隆",
  "670": "圣文森特和格林纳丁斯",
  "706": "索马里",
  "716": "津巴布韦",
  "728": "南苏丹",
  "729": "苏丹",
  "732": "西撒哈拉",
  "760": "叙利亚",
  "768": "多哥",
  "796": "特克斯和凯科斯群岛",
  "804": "乌克兰",
  "850": "美属维尔京群岛",
  "854": "布基纳法索",
  "887": "也门",
  "NE:Somaliland": "索马里兰",
  "NE:Kosovo": "科索沃",
  "NE:N. Cyprus": "北塞浦路斯",
  "NE:Indian Ocean Ter.": "印度洋领地",
  "NE:Siachen Glacier": "锡亚琴冰川",
});

const m49Source = read("app/m49.ts");
const extractArray = (name) => {
  const match = m49Source.match(
    new RegExp(`export const ${name}:[\\s\\S]*?= (\\[[\\s\\S]*?\\n\\]);`),
  );
  if (!match) throw new Error(`Could not extract ${name}`);
  return evaluate(match[1]);
};
const countryIdsMatch = m49Source.match(
  /const COUNTRY_IDS_BY_LEAF:[\s\S]*?= (\{[\s\S]*?\n\});/,
);
if (!countryIdsMatch) throw new Error("Could not extract COUNTRY_IDS_BY_LEAF");

const payload = {
  destinations,
  countryNames,
  themes: ["随机", "自然", "人文", "海岛", "城市", "秘境"],
  regions: extractArray("M49_REGIONS"),
  leafRegions: extractArray("M49_LEAF_REGIONS"),
  countryIdsByLeaf: evaluate(countryIdsMatch[1]),
};
fs.writeFileSync(
  path.join(staticRoot, "data.js"),
  `/* Generated from the untouched source data. */\nwindow.ROAM_DATA=${JSON.stringify(payload)};\n`,
);

const atlasPath = path.join(
  projectRoot,
  "dist/client/assets/countries-50m-BPG4-eBk.js",
);
const atlasModule = fs.readFileSync(atlasPath, "utf8");
const atlasExport = "export{s as n,r,u as t};";
if (!atlasModule.endsWith(atlasExport)) {
  throw new Error("Unexpected world-atlas module export");
}
fs.writeFileSync(
  path.join(staticRoot, "atlas.js"),
  "/* Generated from the project's built atlas. */\n(()=>{\n" +
    atlasModule.slice(0, -atlasExport.length) +
    "\nwindow.ROAM_TOPOLOGY=u;window.ROAM_TO_FEATURE=r;window.ROAM_TO_MESH=s;\n})();\n",
);

const pageBundle = read("dist/client/assets/page-CVUvBHQ7.js");
const d3StartMarker = "var c=class{constructor(){this._partials";
const d3EndMarker = "function xr(){return dr(br).scale(249.5).clipAngle(90+f)}";
const d3Start = pageBundle.indexOf(d3StartMarker);
const d3End = pageBundle.indexOf(d3EndMarker);
if (d3Start < 0 || d3End < 0) {
  throw new Error("Could not extract the bundled geographic renderer");
}
const d3Source = pageBundle.slice(d3Start, d3End + d3EndMarker.length);
fs.writeFileSync(
  path.join(staticRoot, "vendor-geo.js"),
  "/* Geographic renderer extracted from the project's existing compiled bundle. */\n" +
    "(()=>{\n" +
    d3Source +
    "\nwindow.ROAM_GEO={geoPath:Jn,geoOrthographic:xr,geoGraticule10:Gt};\n})();\n",
);

const baseCss = read("app/globals.css").replace('@import "tailwindcss";\n\n', "");
const staticOverrides = `

/* Static build additions */
[hidden] { display: none !important; }
.hero-title-line { display: inline-block; white-space: nowrap; }
.country-static-beacon { --accent: var(--amber); position: absolute; z-index: 7; top: 12%; right: 5%; min-width: 170px; padding: 12px 14px; text-align: right; border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent); border-right: 2px solid var(--accent); background: linear-gradient(135deg, rgba(7,23,28,.92), rgba(8,18,21,.8)); box-shadow: 0 18px 48px rgba(0,0,0,.3); backdrop-filter: blur(14px); pointer-events: none; animation: reveal .38s ease both; }
.country-static-beacon small { display: block; color: var(--accent); font-size: 7px; font-weight: 650; letter-spacing: .18em; }
.country-static-beacon strong { display: block; margin-top: 6px; font-size: 21px; font-weight: 680; }
.country-static-beacon span { display: block; margin-top: 4px; color: #788985; font-size: 8px; }
.static-load-error { position: fixed; z-index: 100; right: 20px; bottom: 20px; left: 20px; padding: 16px; border: 1px solid var(--amber); color: #20160f; background: #f0ae6a; text-align: center; }
.globe-canvas { contain: layout paint size; }
@media (max-width: 680px) {
  .country-static-beacon { top: 9%; right: 5%; min-width: 138px; padding: 10px 12px; }
  .country-static-beacon strong { font-size: 17px; }
}
`;
fs.writeFileSync(
  path.join(staticRoot, "styles.css"),
  "/* Generated from the untouched source stylesheet. */\n" + baseCss + staticOverrides,
);

console.log("Static assets generated: 600 destinations, atlas, stable geo renderer, and styles.");
