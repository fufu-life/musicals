// Stage order for the common German-language Vienna production.
// `sourceOrder` remains the source/recording identity; this list only controls
// the order in which the site's complete song catalogue is presented.
const rebeccaStageSongIds = [
  "37-prolog-ich-hab-getraumt-von-manderley-ich-schatten",
  "33-ich-hab-getraumt-von-manderley-live",
  "02-du-wirst-niemals-eine-lady",
  "70-petit-dejeuner",
  "65-am-abgrund",
  "39-zeit-in-einer-flasche-ich",
  "04-zauberhaft-naturlich-live",
  "40-die-neue-mrs-de-winter-ensemble-mrs-danvers-crawley",
  "41-sie-ergibt-sich-nicht-mrs-danvers",
  "42-die-lieben-verwandten-beatrice-ich-giles",
  "08-bist-du-glucklich",
  "09-bist-du-bose",
  "43-hilf-mir-durch-die-nacht-ich-maxim",
  "44-was-ist-nur-los-mit-ihm-beatrice",
  "72-sie-war-gewohnt-geliebt-zu-werden",
  "12-unser-geheimnis",
  "46-rebecca-mrs-danvers-favell",
  "13-rebecca-lange-fassung",
  "14-merkwurdig",
  "47-sie-s-fort-ben",
  "48-gott-warum-maxim",
  "17-ehrlichkeit-und-vertrauen-live",
  "66-der-ball-von-manderley",
  "18-i-m-an-american-woman-live",
  "19-heut-nacht-verzauber-ich-die-welt-live",
  "49-heut-nacht-verzauber-ich-die-welt-ich",
  "50-finale-erster-akt-mrs-danvers-ensemble",
  "52-und-das-und-das-und-das-ich",
  "53-rebecca-reprise-mrs-danvers-ich-schatten",
  "34-rebecca-reprise-i-live",
  "35-rebecca-reprise-ii-live",
  "22-nur-ein-schritt-live",
  "23-strandgut-ensemble-ich-crawley-favell",
  "24-du-liebst-sie-zu-sehr",
  "54-kein-lacheln-war-je-so-kalt-maxim",
  "55-die-starke-einer-frau-beatrice-ich",
  "56-die-neue-mrs-de-winter-reprise-ensemble",
  "57-mrs-de-winter-bin-ich-ich-mrs-danvers",
  "67-die-voruntersuchung",
  "68-du-machst-mir-angst",
  "58-eine-hand-wascht-die-andre-hand-favell",
  "71-sie-fuhr-n-um-acht",
  "69-keiner-hat-sie-durchschaut",
  "60-ich-hor-dich-singen-rebecca-mrs-danvers-schatten",
  "61-jenseits-der-nacht-ich-maxim",
  "62-manderley-in-flammen-nein-weiss-gott-ensemble-crawley-maxim",
  "36-manderley-in-flammen-live",
  "63-epilog-ich-hab-getraumt-von-manderley-reprise-ich-schatten-ensemble",
];

const rebeccaStageOrder = new Map(rebeccaStageSongIds.map((id, index) => [id, index + 1]));

window.sortSongsForDisplay = (items) => [...items]
  .sort((left, right) => {
    const leftOrder = rebeccaStageOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = rebeccaStageOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  })
  .map((song, index) => ({ ...song, displayOrder: index + 1 }));

window.rebeccaStageOrder = Object.freeze({
  version: "common-german-stage-production",
  songIds: Object.freeze([...rebeccaStageSongIds]),
  actBreakAfter: 27,
});
