const SETTINGS_KEY = "lgmg-display-settings";
const CURRENT_SONG_KEY = "lgmg-current-song-id";
const SIDEBAR_COLLAPSED_KEY = "lgmg-sidebar-collapsed";
const PLAYBACK_RATE_KEY = "lgmg-playback-rate";

const defaultSettings = {
  showZh: true,
  showEn: false,
  showAnalysis: false,
  showPhonetics: false,
};

let correctedLinePhonetics = {};

const COMMON_WORD_GLOSSARY = {
  a: { ipa: "/a/", en: "has / have", zh: "有；已经", speak: "a" },
  "à": { ipa: "/a/", en: "to / at", zh: "向；在；到", speak: "à" },
  au: { ipa: "/o/", en: "to the / at the", zh: "向……；在……" },
  aux: { ipa: "/o/", en: "to the / at the", zh: "向……；在……" },
  ce: { ipa: "/sə/", en: "this / that", zh: "这；那" },
  ces: { ipa: "/se/", en: "these / those", zh: "这些；那些" },
  comme: { ipa: "/kɔm/", en: "like / as", zh: "像；如同" },
  dans: { ipa: "/dɑ̃/", en: "in / into", zh: "在……里" },
  de: { ipa: "/də/", en: "of / from", zh: "的；从" },
  des: { ipa: "/de/", en: "some / of the", zh: "一些；……的" },
  du: { ipa: "/dy/", en: "of the / some", zh: "……的；一些" },
  elle: { ipa: "/ɛl/", en: "she / it", zh: "她；它" },
  en: { ipa: "/ɑ̃/", en: "in / of it", zh: "在……中；对此" },
  est: { ipa: "/ɛ/", en: "is", zh: "是" },
  et: { ipa: "/e/", en: "and", zh: "和；并且" },
  il: { ipa: "/il/", en: "he / it", zh: "他；它" },
  je: { ipa: "/ʒə/", en: "I", zh: "我" },
  la: { ipa: "/la/", en: "the / her", zh: "这；那；她" },
  le: { ipa: "/lə/", en: "the / him", zh: "这；那；他" },
  les: { ipa: "/le/", en: "the", zh: "这些；那些" },
  ma: { ipa: "/ma/", en: "my", zh: "我的" },
  mais: { ipa: "/mɛ/", en: "but", zh: "但是" },
  me: { ipa: "/mə/", en: "me", zh: "我；给我" },
  mes: { ipa: "/me/", en: "my", zh: "我的" },
  mon: { ipa: "/mɔ̃/", en: "my", zh: "我的" },
  ne: { ipa: "/nə/", en: "not", zh: "不；否定结构的一部分" },
  nous: { ipa: "/nu/", en: "we / us", zh: "我们" },
  on: { ipa: "/ɔ̃/", en: "one / people / we", zh: "人们；我们" },
  ou: { ipa: "/u/", en: "or", zh: "或者" },
  "où": { ipa: "/u/", en: "where", zh: "哪里；在……的地方" },
  pas: { ipa: "/pɑ/", en: "not", zh: "不；不是" },
  passion: { ipa: "/pasjɔ̃/", en: "passion", zh: "激情；强烈情感" },
  pour: { ipa: "/puʁ/", en: "for / in order to", zh: "为了；给" },
  que: { ipa: "/kə/", en: "that / what", zh: "那；什么；引导从句" },
  qui: { ipa: "/ki/", en: "who / that", zh: "谁；引导从句" },
  sa: { ipa: "/sa/", en: "his / her", zh: "他/她的" },
  sans: { ipa: "/sɑ̃/", en: "without", zh: "没有；不带" },
  se: { ipa: "/sə/", en: "oneself", zh: "自己；相互" },
  son: { ipa: "/sɔ̃/", en: "his / her / one's", zh: "他/她/一个人的" },
  ta: { ipa: "/ta/", en: "your", zh: "你的" },
  te: { ipa: "/tə/", en: "you", zh: "你；给你" },
  ton: { ipa: "/tɔ̃/", en: "your", zh: "你的" },
  tout: { ipa: "/tu/", en: "all / everything", zh: "全部；一切" },
  temps: { ipa: "/tɑ̃/", en: "time / weather", zh: "时间；时候；天气", speak: "temps" },
  "accordez-moi": { en: "grant me / allow me", zh: "请赐予我；请允许我", speak: "accordez-moi" },
  aimeront: { en: "will love", zh: "将会爱", speak: "aimeront" },
  avez: { en: "have", zh: "有；你们/您有", speak: "avez" },
  bat: { en: "beats", zh: "跳动；搏动", speak: "bat" },
  "bat-il": { en: "does it beat", zh: "它在跳动吗", speak: "bat-il" },
  bien: { en: "well / good", zh: "好；确实；很", speak: "bien" },
  capitale: { en: "capital / punishable by death", zh: "重大的；死刑的", speak: "capitale" },
  cède: { en: "gives in / yields", zh: "让步；屈服", speak: "cède" },
  choisissez: { en: "choose", zh: "选择", speak: "choisissez" },
  choisit: { en: "chooses", zh: "选择", speak: "choisit" },
  citée: { en: "cited / named", zh: "被引用的；被提到的", speak: "citée" },
  crois: { en: "believe / think", zh: "相信；认为", speak: "crois" },
  croyais: { en: "believed / thought", zh: "曾相信；曾以为", speak: "croyais" },
  défaillent: { en: "fail / weaken", zh: "衰弱；失灵；支撑不住", speak: "défaillent" },
  déplu: { en: "displeased", zh: "使不悦；不讨喜", speak: "déplu" },
  déteint: { en: "fades / stains", zh: "褪色；串色；沾染", speak: "déteint" },
  deux: { en: "two", zh: "两个；二", speak: "deux" },
  ding: { en: "ding", zh: "叮；钟声的一部分", speak: "ding" },
  disent: { en: "say", zh: "说；他们说", speak: "disent" },
  disons: { en: "let us say / we say", zh: "我们说；姑且说", speak: "disons" },
  "disons-nous": { en: "let us tell ourselves", zh: "让我们告诉自己；我们心想", speak: "disons-nous" },
  dong: { en: "dong", zh: "咚；钟声的一部分", speak: "dong" },
  donnerai: { en: "will give", zh: "将给予", speak: "donnerai" },
  dormais: { en: "was sleeping", zh: "曾睡着；当时在睡", speak: "dormais" },
  dû: { en: "had to / owed", zh: "不得不；应当；亏欠", speak: "dû" },
  dêtre: { en: "to be", zh: "成为；存在", speak: "d'être" },
  effacées: { en: "erased / faded", zh: "被抹去的；消退的", speak: "effacées" },
  élevant: { en: "raising / lifting", zh: "抬高；养育；提升", speak: "élevant" },
  enfants: { en: "children", zh: "孩子们", speak: "enfants" },
  enfin: { en: "finally / at last", zh: "终于；总算", speak: "enfin" },
  endormie: { en: "asleep", zh: "睡着的；沉睡的", speak: "endormie" },
  entends: { en: "hear / listen", zh: "听见；听", speak: "entends" },
  encore: { en: "again / still", zh: "再次；仍然；还", speak: "encore" },
  espère: { en: "hopes", zh: "希望", speak: "espère" },
  espèrent: { en: "hope", zh: "希望；他们希望", speak: "espèrent" },
  "expliquez-moi": { en: "explain to me", zh: "请向我解释", speak: "expliquez-moi" },
  évitant: { en: "avoiding", zh: "避开；避免", speak: "évitant" },
  fait: { en: "does / makes / fact", zh: "做；使；事实", speak: "fait" },
  "fait-elle": { en: "does she / does it", zh: "她/它做了吗", speak: "fait-elle" },
  faites: { en: "do / make", zh: "做；你们/您做", speak: "faites" },
  "faites-leur": { en: "do to them / make them", zh: "对他们做；让他们", speak: "faites-leur" },
  fallu: { en: "been necessary", zh: "曾经需要；本该", speak: "fallu" },
  faut: { en: "must / is necessary", zh: "必须；需要", speak: "faut" },
  feraient: { en: "would do / would make", zh: "会做；会造成", speak: "feraient" },
  fonds: { en: "funds / depths", zh: "资金；深处；底部", speak: "fonds" },
  font: { en: "do / make", zh: "做；造成；他们使", speak: "font" },
  fuient: { en: "flee", zh: "逃离；逃避", speak: "fuient" },
  fuis: { en: "flee / run away", zh: "逃离；逃避", speak: "fuis" },
  fuit: { en: "flees / leaks away", zh: "逃离；流逝", speak: "fuit" },
  guidera: { en: "will guide", zh: "将引导", speak: "guidera" },
  humain: { en: "human", zh: "人的；人类的", speak: "humain" },
  interdite: { en: "forbidden", zh: "被禁止的；禁忌的", speak: "interdite" },
  ils: { en: "they", zh: "他们", speak: "ils" },
  jattends: { en: "I wait / I expect", zh: "我等待；我期待", speak: "j'attends" },
  jeffacerai: { en: "I will erase", zh: "我会抹去", speak: "j'effacerai" },
  jétreins: { en: "I embrace", zh: "我拥抱", speak: "j'étreins" },
  jéteins: { en: "I put out / extinguish", zh: "我熄灭；我扑灭", speak: "j'éteins" },
  laisse: { en: "leave / let", zh: "留下；让；放手", speak: "laisse" },
  laisser: { en: "to leave / let", zh: "留下；让；放手", speak: "laisser" },
  "lai-je": { en: "have I", zh: "我是否已经", speak: "l'ai-je" },
  lattend: { en: "waits for it / awaits it", zh: "等待它；期待它", speak: "l'attend" },
  leur: { en: "their / to them", zh: "他们的；给他们", speak: "leur" },
  "libérez-nous": { en: "free us", zh: "请解放我们；释放我们", speak: "libérez-nous" },
  liées: { en: "linked / bound", zh: "连接的；被绑定的", speak: "liées" },
  lorsquon: { en: "when one / when we", zh: "当我们；当人们", speak: "lorsqu'on" },
  "l'une": { en: "one", zh: "一个", speak: "l'une" },
  "l'autre": { en: "the other", zh: "另一个", speak: "l'autre" },
  mesurais: { en: "measured", zh: "衡量；曾用……衡量", speak: "mesurais" },
  mettent: { en: "put / place", zh: "放置；使进入", speak: "mettent" },
  méprend: { en: "is mistaken", zh: "误会；弄错", speak: "méprend" },
  meurs: { en: "die", zh: "死去；我死", speak: "meurs" },
  mis: { en: "put / placed", zh: "放置；置于；穿上", speak: "mis" },
  "mont-elles": { en: "do they have me / have they", zh: "她们是否让我；她们是否有", speak: "m'ont-elles" },
  môte: { en: "takes from me", zh: "从我这里夺走", speak: "m'ôte" },
  my: { en: "there / to it", zh: "在那里；向它", speak: "m'y" },
  nai: { en: "have not", zh: "没有；我没有", speak: "n'ai" },
  "na-t-on": { en: "has one not / do we not have", zh: "人们是否没有；我们是否没有", speak: "n'a-t-on" },
  naimant: { en: "not loving", zh: "不爱；没有爱着", speak: "n'aimant" },
  nallez: { en: "do not go / are not going", zh: "不要去；不会去", speak: "n'allez" },
  nattende: { en: "waits for / expects", zh: "等待；期待", speak: "n'attende" },
  "nétait-ce": { en: "was it not", zh: "难道不是吗", speak: "n'était-ce" },
  nobtienne: { en: "does not obtain", zh: "得不到；没有获得", speak: "n'obtienne" },
  noie: { en: "drowns", zh: "淹没；沉溺", speak: "noie" },
  notre: { en: "our", zh: "我们的", speak: "notre" },
  oh: { en: "oh", zh: "哦；啊", speak: "oh" },
  oui: { en: "yes", zh: "是；愿意；同意", speak: "oui" },
  partent: { en: "leave", zh: "离开；出发", speak: "partent" },
  pâlissent: { en: "grow pale / fade", zh: "变得苍白；褪色；黯淡", speak: "pâlissent" },
  passées: { en: "past / spent", zh: "过去的；度过的", speak: "passées" },
  pense: { en: "thinks", zh: "想；认为", speak: "pense" },
  perdu: { en: "lost / wasted", zh: "失去的；白费的", speak: "perdu" },
  pèseront: { en: "will weigh", zh: "将压在；将衡量", speak: "pèseront" },
  plais: { en: "please / appeal", zh: "取悦；吸引", speak: "plais" },
  poussé: { en: "pushed", zh: "推向；推动", speak: "poussé" },
  prétendant: { en: "claiming / pretending", zh: "声称；假装；借口说", speak: "prétendant" },
  priais: { en: "prayed", zh: "祈祷；曾祈求", speak: "priais" },
  préfères: { en: "prefer", zh: "更喜欢；宁愿", speak: "préfères" },
  prend: { en: "takes", zh: "拿取；采取", speak: "prend" },
  prends: { en: "take", zh: "拿；采取；接受", speak: "prends" },
  promet: { en: "promises", zh: "承诺", speak: "promet" },
  promettant: { en: "promising", zh: "承诺着", speak: "promettant" },
  pu: { en: "could / been able to", zh: "能够；曾能", speak: "pu" },
  punissez: { en: "punish", zh: "惩罚", speak: "punissez" },
  quel: { en: "what / which", zh: "什么；哪一个；多么", speak: "quel" },
  quels: { en: "what / which", zh: "哪些；什么样的", speak: "quels" },
  "quest-ce": { en: "what is it", zh: "是什么", speak: "qu'est-ce" },
  reviens: { en: "come back", zh: "回来；再次到来", speak: "reviens" },
  ressens: { en: "feel", zh: "感到；感受", speak: "ressens" },
  rêve: { en: "dream", zh: "梦；梦想", speak: "rêve" },
  rompues: { en: "broken", zh: "断裂的；破裂的", speak: "rompues" },
  sattend: { en: "expects", zh: "期待；预料", speak: "s'attend" },
  saime: { en: "loves oneself / each other", zh: "相爱；爱自己", speak: "s'aime" },
  saisi: { en: "seized / grasped", zh: "抓住；理解；占据", speak: "saisi" },
  sauvera: { en: "will save", zh: "将拯救", speak: "sauvera" },
  savez: { en: "know", zh: "知道；您知道", speak: "savez" },
  séduisez: { en: "seduce / charm", zh: "诱惑；吸引", speak: "séduisez" },
  "s'efforçant": { en: "striving / forcing oneself", zh: "努力着；强迫自己", speak: "s'efforçant" },
  sefforçant: { en: "striving / forcing oneself", zh: "努力着；强迫自己", speak: "s'efforçant" },
  séprend: { en: "falls in love", zh: "爱上；迷恋", speak: "s'éprend" },
  ses: { en: "his / her", zh: "他/她的；其", speak: "ses" },
  séteint: { en: "goes out / fades", zh: "熄灭；消退", speak: "s'éteint" },
  seulement: { en: "only", zh: "仅仅；只是", speak: "seulement" },
  sindiffèrent: { en: "are indifferent to each other", zh: "彼此冷漠；互不关心", speak: "s'indiffèrent" },
  soumises: { en: "submitted / submissive", zh: "顺从的；被提交的", speak: "soumises" },
  sous: { en: "under", zh: "在……之下", speak: "sous" },
  suggèrent: { en: "suggest", zh: "暗示；建议", speak: "suggèrent" },
  suivent: { en: "follow", zh: "跟随；接着", speak: "suivent" },
  sunit: { en: "unites / joins", zh: "结合；联合", speak: "s'unit" },
  surprend: { en: "surprises", zh: "使惊讶；撞见", speak: "surprend" },
  sy: { en: "there / to it", zh: "在那里；向那里", speak: "s'y" },
  tant: { en: "so much / so many", zh: "如此多；这么", speak: "tant" },
  tapporter: { en: "to bring you", zh: "带给你", speak: "t'apporter" },
  tes: { en: "your", zh: "你的", speak: "tes" },
  tient: { en: "holds / depends", zh: "握住；取决于", speak: "tient" },
  tombé: { en: "fallen", zh: "倒下的；落下的", speak: "tombé" },
  tombera: { en: "will fall", zh: "将倒下；将落下", speak: "tombera" },
  tomberont: { en: "will fall", zh: "将倒下；将落下", speak: "tomberont" },
  touchaient: { en: "touched / struck", zh: "触及；击中", speak: "touchaient" },
  tous: { en: "all", zh: "所有；全部", speak: "tous" },
  toute: { en: "all / whole", zh: "全部的；整个的", speak: "toute" },
  toutes: { en: "all", zh: "所有；全部", speak: "toutes" },
  trahit: { en: "betrays / reveals", zh: "背叛；暴露", speak: "trahit" },
  trouverez: { en: "will find", zh: "将找到；会发现", speak: "trouverez" },
  tue: { en: "kills", zh: "杀死；毁掉", speak: "tue" },
  va: { en: "goes", zh: "去；走向", speak: "va" },
  valaient: { en: "were worth", zh: "值得；有价值", speak: "valaient" },
  vas: { en: "go / are going", zh: "去；将要", speak: "vas" },
  vaux: { en: "am worth / are worth", zh: "值；有价值", speak: "vaux" },
  vers: { en: "toward", zh: "朝向；向", speak: "vers" },
  vie: { en: "life", zh: "生命；生活", speak: "vie" },
  vient: { en: "comes", zh: "来到；来自", speak: "vient" },
  visé: { en: "aimed at", zh: "瞄准；针对", speak: "visé" },
  vois: { en: "see", zh: "看见；明白", speak: "vois" },
  "vois-tu": { en: "do you see", zh: "你看见吗；你明白吗", speak: "vois-tu" },
  veulent: { en: "want", zh: "想要；他们想", speak: "veulent" },
  vont: { en: "go / are going", zh: "去；将要", speak: "vont" },
  voulais: { en: "wanted", zh: "曾想要", speak: "voulais" },
  voulez: { en: "want", zh: "想要；您/你们想", speak: "voulez" },
  voulu: { en: "wanted", zh: "想要过；所愿的", speak: "voulu" },
  vu: { en: "seen", zh: "看见；见过", speak: "vu" },
  une: { ipa: "/yn/", en: "a / one", zh: "一个；一位" },
  un: { ipa: "/œ̃/", en: "a / one", zh: "一个；一位" },
  votre: { ipa: "/vɔtʁ/", en: "your", zh: "你们的；您的" },
  vous: { ipa: "/vu/", en: "you", zh: "你；你们；您" },
  comprendre: { ipa: "/kɔ̃pʁɑ̃dʁ/", en: "to understand", zh: "理解" },
  "aujourdhui": { ipa: "/oʒuʁdɥi/", en: "today", zh: "今天", speak: "aujourd'hui" },
  "bâtissez": { ipa: "/batisɛ/", en: "build", zh: "建造；建立", speak: "bâtissez" },
  "adorons": { ipa: "/adɔʁɔ̃/", en: "let us adore", zh: "让我们崇拜；赞美", speak: "adorons" },
  "annonçons": { ipa: "/anɔ̃sɔ̃/", en: "let us announce", zh: "让我们宣布；宣告", speak: "annonçons" },
  "bon": { ipa: "/bɔ̃/", en: "good", zh: "好的；令人舒服的", speak: "bon" },
  "brandissez": { ipa: "/bʁɑ̃disɛ/", en: "brandish", zh: "挥舞；高举", speak: "brandissez" },
  "ça": { ipa: "/sa/", en: "that / this", zh: "这；那；这种事", speak: "ça" },
  "car": { ipa: "/kaʁ/", en: "because", zh: "因为", speak: "car" },
  "chaque": { ipa: "/ʃak/", en: "each / every", zh: "每个；每一", speak: "chaque" },
  "choisi": { ipa: "/ʃwazi/", en: "chosen", zh: "选择了；选中的", speak: "choisi" },
  "combien": { ipa: "/kɔ̃bjɛ̃/", en: "how much / how many", zh: "多少；多么", speak: "combien" },
  "comment": { ipa: "/kɔmɑ̃/", en: "how", zh: "如何；怎么", speak: "comment" },
  "convole": { ipa: "/kɔ̃vɔl/", en: "gets married again", zh: "再婚；成婚", speak: "convole" },
  "court": { ipa: "/kuʁ/", en: "runs", zh: "奔跑；追逐", speak: "court" },
  "cette": { ipa: "/sɛt/", en: "this / that", zh: "这个；那个", speak: "cette" },
  "défendez": { ipa: "/defɑ̃de/", en: "defend", zh: "保卫；维护", speak: "défendez" },
  "dévorent": { ipa: "/devɔʁ/", en: "devour", zh: "吞噬；折磨", speak: "dévorent" },
  "dit": { ipa: "/di/", en: "says / tells", zh: "说；告诉", speak: "dit" },
  "dirai": { ipa: "/diʁe/", en: "will say", zh: "将会说", speak: "dirai" },
  "doit": { ipa: "/dwa/", en: "must / has to", zh: "必须；应该", speak: "doit" },
  "donc": { ipa: "/dɔ̃k/", en: "so / therefore", zh: "所以；那么", speak: "donc" },
  "effeuille": { ipa: "/efœj/", en: "strips leaves / petals", zh: "摘落花瓣；剥落", speak: "effeuille" },
  "écrit": { ipa: "/ekʁi/", en: "writes / written", zh: "写下；写着的", speak: "écrit" },
  "élevez": { ipa: "/elve/", en: "raise / lift", zh: "抬高；培养；举起", speak: "élevez" },
  "éloignez": { ipa: "/elwaɲe/", en: "move away / keep away", zh: "远离；驱离", speak: "éloignez" },
  "enterrez": { ipa: "/ɑ̃teʁe/", en: "bury", zh: "埋葬", speak: "enterrez" },
  "érigeant": { ipa: "/eʁiʒɑ̃/", en: "raising / erecting", zh: "树立；建起", speak: "érigeant" },
  "êtes": { ipa: "/ɛt/", en: "are", zh: "是；你们是", speak: "êtes" },
  "évita": { ipa: "/evita/", en: "avoided", zh: "避开了；避免了", speak: "évita" },
  "fais": { ipa: "/fɛ/", en: "do / make", zh: "做；制造", speak: "fais" },
  "fiez": { ipa: "/fje/", en: "trust", zh: "相信；信任", speak: "fiez" },
  "finie": { ipa: "/fini/", en: "finished / over", zh: "结束的；完了的", speak: "finie" },
  "gardons": { ipa: "/ɡaʁdɔ̃/", en: "let us keep", zh: "让我们保留；守住", speak: "gardons" },
  "gravée": { ipa: "/ɡʁave/", en: "engraved", zh: "刻下的；铭刻的", speak: "gravée" },
  "jai": { ipa: "/ʒe/", en: "I have", zh: "我有；我已经", speak: "j'ai" },
  "japprends": { ipa: "/ʒapʁɑ̃/", en: "I learn", zh: "我学会；我得知", speak: "j'apprends" },
  "javoue": { ipa: "/ʒavu/", en: "I admit", zh: "我承认；我坦白", speak: "j'avoue" },
  "jeffleure": { ipa: "/ʒeflœʁ/", en: "I brush lightly", zh: "我轻触；我掠过", speak: "j'effleure" },
  "jimagine": { ipa: "/ʒimaʒin/", en: "I imagine", zh: "我想象", speak: "j'imagine" },
  "jour": { ipa: "/ʒuʁ/", en: "day", zh: "日子；一天", speak: "jour" },
  "joue": { ipa: "/ʒu/", en: "plays / acts", zh: "扮演；玩弄", speak: "joue" },
  "jure": { ipa: "/ʒyʁ/", en: "swear", zh: "发誓", speak: "jure" },
  "jusquà": { ipa: "/ʒyska/", en: "until / up to", zh: "直到；一直到", speak: "jusqu'à" },
  "jusquau": { ipa: "/ʒysko/", en: "until / up to the", zh: "直到；一直到", speak: "jusqu'au" },
  "languit": { ipa: "/lɑ̃ɡi/", en: "languishes", zh: "憔悴；衰弱；渴望", speak: "languit" },
  "leurs": { ipa: "/lœʁ/", en: "their", zh: "他们的；她们的", speak: "leurs" },
  "lignore": { ipa: "/liɲɔʁ/", en: "ignores it / does not know it", zh: "不知道；无视", speak: "l'ignore" },
  "lit": { ipa: "/li/", en: "reads", zh: "读；阅读", speak: "lit" },
  "louvoie": { ipa: "/luvwa/", en: "dodges / tacks", zh: "闪躲；迂回", speak: "louvoie" },
  "maudis": { ipa: "/modi/", en: "curse", zh: "诅咒；咒骂", speak: "maudis" },
  "marrache": { ipa: "/maʁaʃ/", en: "tears from me", zh: "从我身上夺走；撕下", speak: "m'arrache" },
  "mélève": { ipa: "/melɛv/", en: "raises me", zh: "托举我；让我升起", speak: "m'élève" },
  "menrichis": { ipa: "/mɑ̃ʁiʃi/", en: "enrich myself", zh: "使自己富起来", speak: "m'enrichis" },
  "mens": { ipa: "/mɑ̃/", en: "lie", zh: "说谎", speak: "mens" },
  "minquiète": { ipa: "/mɛ̃kjɛt/", en: "worries me", zh: "让我不安；使我担心", speak: "m'inquiète" },
  "minspirez": { ipa: "/mɛ̃spiʁe/", en: "inspire me", zh: "启发我；鼓舞我", speak: "m'inspirez" },
  "minvite": { ipa: "/mɛ̃vit/", en: "invites me", zh: "邀请我；引诱我", speak: "m'invite" },
  "montrant": { ipa: "/mɔ̃tʁɑ̃/", en: "showing", zh: "展示；表明", speak: "montrant" },
  "na": { ipa: "/na/", en: "has not", zh: "没有", speak: "n'a" },
  "nayez": { ipa: "/nɛje/", en: "do not have", zh: "不要有", speak: "n'ayez" },
  "née": { ipa: "/ne/", en: "born", zh: "出生的；诞生的", speak: "née" },
  "nos": { ipa: "/no/", en: "our", zh: "我们的", speak: "nos" },
  "ont": { ipa: "/ɔ̃/", en: "have", zh: "有；已经", speak: "ont" },
  "ose": { ipa: "/oz/", en: "dares", zh: "敢于", speak: "ose" },
  "oubliez": { ipa: "/ublije/", en: "forget", zh: "忘记", speak: "oubliez" },
  "par": { ipa: "/paʁ/", en: "by / through", zh: "被；通过；由", speak: "par" },
  "part": { ipa: "/paʁ/", en: "leaves / share", zh: "离开；一份", speak: "part" },
  "peux": { ipa: "/pø/", en: "can", zh: "能；可以", speak: "peux" },
  "perd": { ipa: "/pɛʁ/", en: "loses / is lost", zh: "失去；正在消失", speak: "perd" },
  "pleure": { ipa: "/plœʁ/", en: "cries", zh: "哭泣", speak: "pleure" },
  "plus": { ipa: "/plys/", en: "more", zh: "更多；更", speak: "plus" },
  "prédit": { ipa: "/pʁedi/", en: "predicts", zh: "预言；预告", speak: "prédit" },
  "pris": { ipa: "/pʁi/", en: "taken / caught", zh: "被拿走；被抓住", speak: "pris" },
  "poursuivrai": { ipa: "/puʁsɥivʁe/", en: "will pursue / continue", zh: "我会追随；我会继续", speak: "poursuivrai" },
  "puisquon": { ipa: "/pɥiskɔ̃/", en: "since one / since we", zh: "既然我们；既然人们", speak: "puisqu'on" },
  "quand": { ipa: "/kɑ̃/", en: "when", zh: "当……时候；既然", speak: "quand" },
  "quà": { ipa: "/ka/", en: "only to / than to", zh: "只向；只比", speak: "qu'à" },
  "quils": { ipa: "/kil/", en: "that they", zh: "他们……；那些人……", speak: "qu'ils" },
  "ravalez": { ipa: "/ʁavale/", en: "swallow back", zh: "咽下；压回去", speak: "ravalez" },
  "recueille": { ipa: "/ʁəkœj/", en: "gathers / collects", zh: "收集；采集", speak: "recueille" },
  "regardez": { ipa: "/ʁəɡaʁde/", en: "look", zh: "看；请看", speak: "regardez" },
  "rend": { ipa: "/ʁɑ̃/", en: "makes / returns", zh: "使变得；归还", speak: "rend" },
  "renaissez": { ipa: "/ʁənɛse/", en: "are reborn", zh: "重生；再次诞生", speak: "renaissez" },
  "renie": { ipa: "/ʁəni/", en: "denies / disowns", zh: "否认；背弃", speak: "renie" },
  "revivrez": { ipa: "/ʁəvivʁe/", en: "will live again", zh: "你们将重生；再次活着", speak: "revivrez" },
  "récitons": { ipa: "/ʁesitɔ̃/", en: "let us recite", zh: "让我们诵读；背诵", speak: "récitons" },
  "ris": { ipa: "/ʁi/", en: "laugh", zh: "笑", speak: "ris" },
  "sème": { ipa: "/sɛm/", en: "sows", zh: "播下；散布", speak: "sème" },
  "sacrifiez": { ipa: "/sakʁifje/", en: "sacrifice", zh: "牺牲；献祭", speak: "sacrifiez" },
  "sabuse": { ipa: "/sabyz/", en: "is mistaken / deceives oneself", zh: "自欺；误以为", speak: "s'abuse" },
  "sanctifiez": { ipa: "/sɑ̃ktifje/", en: "sanctify", zh: "神圣化；祝圣", speak: "sanctifiez" },
  "scellas": { ipa: "/sɛla/", en: "sealed", zh: "封死；封印", speak: "scellas" },
  "sépare": { ipa: "/sepaʁ/", en: "separates", zh: "分开；隔开", speak: "sépare" },
  "senti": { ipa: "/sɑ̃ti/", en: "felt", zh: "感到；感觉到", speak: "senti" },
  "sert": { ipa: "/sɛʁ/", en: "serves / is useful", zh: "有用；服务于", speak: "sert" },
  "si": { ipa: "/si/", en: "if / so", zh: "如果；如此", speak: "si" },
  "soit": { ipa: "/swa/", en: "be / whether", zh: "是；无论", speak: "soit" },
  "sont": { ipa: "/sɔ̃/", en: "are", zh: "是；处于", speak: "sont" },
  "sort": { ipa: "/sɔʁ/", en: "fate / goes out", zh: "命运；出去", speak: "sort" },
  "souvent": { ipa: "/suvɑ̃/", en: "often", zh: "经常", speak: "souvent" },
  "souris": { ipa: "/suʁi/", en: "smile", zh: "微笑", speak: "souris" },
  "soyez": { ipa: "/swaje/", en: "be", zh: "请成为；要做", speak: "soyez" },
  "suis": { ipa: "/sɥi/", en: "am / follow", zh: "是；跟随", speak: "suis" },
  "suis-je": { ipa: "/sɥi ʒə/", en: "am I", zh: "我是……吗", speak: "suis-je" },
  "supportons": { ipa: "/sypɔʁtɔ̃/", en: "we endure / let us endure", zh: "我们承受；忍受", speak: "supportons" },
  "sur": { ipa: "/syʁ/", en: "on / upon", zh: "在……上；关于", speak: "sur" },
  "surgis": { ipa: "/syʁʒi/", en: "arisen / appeared", zh: "冒出；突然出现", speak: "surgis" },
  "tabandonnes": { ipa: "/tabɑ̃dɔn/", en: "you abandon yourself", zh: "你放弃自己；你交付自己", speak: "t'abandonnes" },
  "tâchons": { ipa: "/taʃɔ̃/", en: "let us try", zh: "让我们试着；努力", speak: "tâchons" },
  "tenez-vous": { ipa: "/təne vu/", en: "stand / hold yourselves", zh: "站好；保持", speak: "tenez-vous" },
  "tombez": { ipa: "/tɔ̃be/", en: "fall", zh: "倒下；落下", speak: "tombez" },
  "très": { ipa: "/tʁɛ/", en: "very", zh: "很；非常", speak: "très" },
  "tu": { ipa: "/ty/", en: "you", zh: "你", speak: "tu" },
  "vau-l": { ipa: "/vo l/", en: "fragment in the line", zh: "歌词片段；按原句理解", speak: "vau-l" },
  "vais": { ipa: "/vɛ/", en: "go / am going to", zh: "去；将要", speak: "vais" },
  "vaut": { ipa: "/vo/", en: "is worth", zh: "值得；价值是", speak: "vaut" },
  "veillons": { ipa: "/vejɔ̃/", en: "let us watch over", zh: "让我们守护；留心", speak: "veillons" },
  "vend": { ipa: "/vɑ̃/", en: "sells", zh: "出售；卖出", speak: "vend" },
  "vos": { ipa: "/vo/", en: "your", zh: "你们的；您的", speak: "vos" },
  "veux": { ipa: "/vø/", en: "want", zh: "想要", speak: "veux" },
};

const INFLECTED_GLOSSARY_FORMS = {
  comprendra: {
    lemma: "comprendre",
    ipa: "/kɔ̃pʁɑ̃dʁa/",
    en: "will understand",
    zh: "将会理解",
  },
  comprend: {
    lemma: "comprendre",
    ipa: "/kɔ̃pʁɑ̃/",
    en: "understands",
    zh: "理解；懂得",
  },
  comprends: {
    lemma: "comprendre",
    ipa: "/kɔ̃pʁɑ̃/",
    en: "understand",
    zh: "理解；懂得",
  },
  compris: {
    lemma: "comprendre",
    ipa: "/kɔ̃pʁi/",
    en: "understood",
    zh: "理解了；懂了",
  },
};

const songGlossaryCache = new WeakMap();

const sortedSongs = [...(window.songsInitial || window.songs || [])].sort((a, b) => {
  return (a.order || 0) - (b.order || 0);
});
let fullSongsReady = null;

const appState = {
  settings: { ...defaultSettings, ...loadJson(SETTINGS_KEY, {}) },
  expanded: new Set(),
  expandedPhonetics: new Set(),
  currentSongId: resolveInitialSongId(),
  sidebarCollapsed: loadJson(SIDEBAR_COLLAPSED_KEY, false),
};

const refs = {
  appLayout: document.querySelector(".app-layout"),
  contentShell: document.querySelector(".content-shell"),
  songNav: document.querySelector("#songNav"),
  songSelect: document.querySelector("#songSelect"),
  sidebarToggles: [...document.querySelectorAll("[data-sidebar-toggle]")],
  currentSongTitle: document.querySelector("#currentSongTitle"),
  songPlayButton: document.querySelector("#songPlayButton"),
  currentSongZhTitle: document.querySelector("#currentSongZhTitle"),
  lyricsList: document.querySelector("#lyricsList"),
  listStatus: document.querySelector("#listStatus"),
  storyPosition: document.querySelector("#storyPosition"),
  backToTop: document.querySelector("#backToTop"),
  toggleButtons: [...document.querySelectorAll("[data-toggle]")],
};

const wordPopup = createWordPopup();
const speechState = {
  frenchVoice: null,
};

const audioState = {
  current: null,
  finish: null,
  speechFinish: null,
  preload: null,
  rateControlled: false,
};

const analytics = window.MusicalAnalytics.initShow({
  showId: "rouge_et_noir",
  showName: "Le Rouge et le Noir",
  pageType: "lyrics_learning",
  getProgressElement: () => refs.lyricsList,
});

const pageTools = window.MusicalLyricsPageTools.create({
  songs: sortedSongs,
  rateStorageKey: PLAYBACK_RATE_KEY,
  hero: document.querySelector(".hero"),
  actionContainer: document.querySelector(".desktop-search-slot"),
  mobileActionContainer: document.querySelector(".mobile-search-row"),
  titleRow: document.querySelector(".song-title-row"),
  rateContainer: document.querySelector(".song-playback-tools"),
  lyrics: document.querySelector(".lyrics-column"),
  mobilePicker: document.querySelector(".mobile-song-picker"),
  getCurrentSong,
  getSongTitleSecondary: (song) => song.titleZh || "",
  getLinePrimary: (line) => line.fr || "",
  getLineSecondary: (line) => [line.en, line.zh].filter(Boolean).join(" · "),
  ensureSearchReady: ensureFullSongs,
  onNavigate: navigateToSearchResult,
  onRateChange(rate) {
    if (audioState.current && audioState.rateControlled) {
      audioState.current.defaultPlaybackRate = rate;
      audioState.current.playbackRate = rate;
    }
  },
});

const audioController = window.MusicalAudio.createController({
  stopCurrent: stopCurrentPlayback,
  pauseCurrent: pauseCurrentPlayback,
  resumeCurrent: resumeCurrentPlayback,
  onSequenceStateChange: pageTools.setSequenceActive,
  onSequencePauseChange: pageTools.setSequencePaused,
  onItemClear: clearSequenceHighlight,
});
pageTools.connectController(audioController);

const songTransition = {
  outTimer: null,
  settleTimer: null,
};

init();

function init() {
  document.body.append(wordPopup);
  setupSpeechVoices();
  bindControls();
  bindSongSelect();
  bindSidebarToggle();
  bindHashChange();
  bindPopupDismissal();
  bindBackToTop();
  refs.songPlayButton?.addEventListener("click", toggleCurrentSongPlayback);
  bindRougeCursor();
  updateSidebarState();
  renderCurrentSong();
  if (!getCurrentSong()?.lines.length) {
    ensureFullSongs().then(renderCurrentSong);
  }
  scheduleDeferredPhonetics();
}

function loadScript(src, fetchPriority = "auto") {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.fetchPriority = fetchPriority;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.append(script);
  });
}

async function loadFullSongs() {
  await loadScript("songs.js", "high");
  const fullSongs = [...(window.songs || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!fullSongs.length) throw new Error("Full Rouge et Noir song data is empty");
  sortedSongs.splice(0, sortedSongs.length, ...fullSongs);
}

function ensureFullSongs() {
  if (!fullSongsReady) {
    fullSongsReady = loadFullSongs().catch((error) => {
      fullSongsReady = null;
      console.error("Deferred Rouge et Noir song data failed to load", error);
      throw error;
    });
  }
  return fullSongsReady;
}

async function loadDeferredPhonetics() {
  await loadScript("line-phonetics.js");
  correctedLinePhonetics = window.rougeLinePhonetics || {};
  if (appState.settings.showPhonetics) renderCurrentSong();
}

function scheduleDeferredPhonetics() {
  const load = () => {
    loadDeferredPhonetics().catch((error) => {
      console.error("Deferred Rouge et Noir phonetics failed to load", error);
    });
  };
  const start = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(load, { timeout: 3000 });
    } else {
      window.setTimeout(load, 1200);
    }
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

function loadJson(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appState.settings));
}

function resolveInitialSongId() {
  const hashSongId = getSongIdFromHash();
  const savedSongId = localStorage.getItem(CURRENT_SONG_KEY);
  const candidate = [hashSongId, savedSongId].find(isKnownSongId);
  return candidate || sortedSongs[0]?.id || "";
}

function getSongIdFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("song");
}

function isKnownSongId(songId) {
  return sortedSongs.some((song) => song.id === songId);
}

function getCurrentSong() {
  return sortedSongs.find((song) => song.id === appState.currentSongId) || sortedSongs[0] || null;
}

function expandedKey(songId, lineId) {
  return `${songId}::${lineId}`;
}

function bindControls() {
  refs.toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggle;
      appState.settings[key] = !appState.settings[key];

      if (key === "showAnalysis") {
        appState.expanded.clear();
      }

      if (key === "showPhonetics") {
        appState.expandedPhonetics.clear();
      }

      saveSettings();
      updateViewSettings();
      renderCurrentSong();
      trackDisplayToggle(key);
    });
  });
}

function bindSongSelect() {
  refs.songSelect.addEventListener("change", (event) => {
    selectSong(event.target.value);
  });
}

function bindSidebarToggle() {
  refs.sidebarToggles.forEach((button) => {
    button.addEventListener("click", toggleSidebar);
  });
}

function toggleSidebar() {
  appState.sidebarCollapsed = !appState.sidebarCollapsed;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(appState.sidebarCollapsed));
  updateSidebarState();
}

function updateSidebarState() {
  refs.appLayout.classList.toggle("is-sidebar-collapsed", appState.sidebarCollapsed);
  refs.sidebarToggles.forEach((button) => {
    const isCompact = button.classList.contains("sidebar-toggle-compact");
    button.textContent = appState.sidebarCollapsed ? "展开曲目" : isCompact ? "收起" : "收起曲目";
    button.setAttribute("aria-expanded", String(!appState.sidebarCollapsed));
  });
}

function bindHashChange() {
  window.addEventListener("hashchange", async () => {
    const songId = getSongIdFromHash();

    if (isKnownSongId(songId) && songId !== appState.currentSongId) {
      if (!sortedSongs.find((song) => song.id === songId)?.lines.length) {
        await ensureFullSongs();
      }
      audioController.stopAll();
      appState.currentSongId = songId;
      localStorage.setItem(CURRENT_SONG_KEY, songId);
      appState.expanded.clear();
      hideWordPopup();
      renderCurrentSongWithTransition();
      resetSongScrollPosition();
    }
  });
}

async function selectSong(songId) {
  if (!isKnownSongId(songId)) {
    return;
  }

  if (appState.sidebarCollapsed) {
    expandSidebar();
  }

  if (songId === appState.currentSongId) {
    return;
  }
  if (!sortedSongs.find((song) => song.id === songId)?.lines.length) {
    await ensureFullSongs();
  }

  audioController.stopAll();
  appState.currentSongId = songId;
  localStorage.setItem(CURRENT_SONG_KEY, songId);
  appState.expanded.clear();
  hideWordPopup();

  const nextHash = `#song=${encodeURIComponent(songId)}`;
  if (window.location.hash !== nextHash) {
    window.history.pushState(null, "", nextHash);
  }

  renderCurrentSongWithTransition();
  resetSongScrollPosition();
}

function navigateToSearchResult(songId, lineId = "") {
  if (!isKnownSongId(songId)) return;
  audioController.stopAll();
  appState.currentSongId = songId;
  localStorage.setItem(CURRENT_SONG_KEY, songId);
  appState.expanded.clear();
  hideWordPopup();
  renderCurrentSong();
  if (!lineId) {
    resetSongScrollPosition();
    return;
  }
  requestAnimationFrame(() => {
    const card = document.getElementById(lineId);
    card?.classList.add("is-search-target");
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => card?.classList.remove("is-search-target"), 1800);
  });
}

function resetSongScrollPosition() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function expandSidebar() {
  appState.sidebarCollapsed = false;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(appState.sidebarCollapsed));
  updateSidebarState();
}

function updateViewSettings() {
  refs.toggleButtons.forEach((button) => {
    const key = button.dataset.toggle;
    const isActive = Boolean(appState.settings[key]);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderSongNav() {
  const currentSong = getCurrentSong();
  refs.songNav.innerHTML = "";
  refs.songSelect.innerHTML = "";

  sortedSongs.forEach((song) => {
    const button = document.createElement("button");
    const isActive = song.id === currentSong?.id;
    button.className = "song-nav-item";
    button.classList.toggle("is-active", isActive);
    button.type = "button";
    button.setAttribute("aria-current", isActive ? "page" : "false");
    button.addEventListener("click", () => selectSong(song.id));

    const order = document.createElement("span");
    order.className = "song-order";
    order.textContent = String(song.order || 0).padStart(2, "0");

    const title = document.createElement("span");
    title.className = "song-nav-title";
    title.textContent = song.title;

    const zhTitle = document.createElement("span");
    zhTitle.className = "song-nav-zh";
    zhTitle.textContent = song.zhTitle || song.title;

    button.append(order, title, zhTitle);
    refs.songNav.append(button);

    const option = document.createElement("option");
    option.value = song.id;
    option.textContent = song.title;
    option.selected = isActive;
    refs.songSelect.append(option);
  });
}

function renderCurrentSong() {
  const currentSong = getCurrentSong();
  updateViewSettings();
  renderSongNav();

  if (!currentSong) {
    refs.currentSongTitle.textContent = "暂无歌曲";
    refs.currentSongZhTitle.textContent = "";
    refs.storyPosition.textContent = "";
    refs.listStatus.textContent = "";
    refs.lyricsList.innerHTML = "";
    refs.songPlayButton.disabled = true;
    return;
  }

  document.title = currentSong.title;
  refs.currentSongTitle.innerHTML = "";
  refs.currentSongTitle.append(renderFrenchText(currentSong, currentSong.title, false));
  refs.currentSongZhTitle.innerHTML = "";
  refs.currentSongZhTitle.append(document.createTextNode(currentSong.zhTitle || ""));
  const roleLabel = getSongRoleLabel(currentSong);
  if (roleLabel) {
    refs.currentSongZhTitle.append(document.createTextNode(" "));
    refs.currentSongZhTitle.append(createRoleTag(roleLabel));
  }
  refs.storyPosition.textContent = currentSong.storyPosition || "";
  refs.songPlayButton.disabled = !currentSong.lines.length;

  renderLyrics(currentSong);
  enterAnalyticsSong(currentSong);
}

function renderCurrentSongWithTransition() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!refs.contentShell || reduceMotion) {
    renderCurrentSong();
    return;
  }

  window.clearTimeout(songTransition.outTimer);
  window.clearTimeout(songTransition.settleTimer);

  refs.contentShell.classList.remove("is-song-settling");
  refs.contentShell.classList.add("is-song-changing");

  songTransition.outTimer = window.setTimeout(() => {
    renderCurrentSong();

    window.requestAnimationFrame(() => {
      refs.contentShell.classList.remove("is-song-changing");
      refs.contentShell.classList.add("is-song-settling");

      songTransition.settleTimer = window.setTimeout(() => {
        refs.contentShell.classList.remove("is-song-settling");
      }, 260);
    });
  }, 120);
}

function getSongRoleLabel(song) {
  return song.performerTag || song.characterTag || song.character || "";
}

function createRoleTag(label) {
  const tag = document.createElement("span");
  tag.className = "song-role-tag";
  tag.textContent = label;
  return tag;
}

function renderLyrics(song) {
  refs.lyricsList.innerHTML = "";

  if (!song.lines.length) {
    refs.listStatus.textContent = "共 0 句";
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "这首歌的歌词数据还没有录入";
    refs.lyricsList.append(empty);
    return;
  }

  refs.listStatus.textContent = `共 ${song.lines.length} 句`;

  song.lines.forEach((line) => {
    refs.lyricsList.append(renderLyricLine(song, line));
  });
}

function renderLyricLine(song, line) {
  const card = document.createElement("article");
  const lineNumber = song.lines.findIndex((item) => item.id === line.id) + 1;
  const isExpanded =
    appState.settings.showAnalysis || appState.expanded.has(expandedKey(song.id, line.id));
  const isPhoneticsExpanded =
    appState.settings.showPhonetics || appState.expandedPhonetics.has(expandedKey(song.id, line.id));

  card.className = "lyric-card";
  card.id = line.id;
  card.dataset.index = String(lineNumber).padStart(2, "0");

  const textBlock = document.createElement("div");
  textBlock.className = "line-text";

  const fr = document.createElement("p");
  fr.className = "fr";
  fr.append(renderFrenchText(song, line.fr, isPhoneticsExpanded, line));

  const sentenceSpeakButton = document.createElement("button");
  sentenceSpeakButton.className = "sentence-speak speak-button";
  sentenceSpeakButton.type = "button";
  sentenceSpeakButton.setAttribute("aria-label", `朗读整句：${line.fr}`);
  sentenceSpeakButton.append(createSpeakerIcon());
  const lineAudioPath = getLineAudioPath(song, line);
  const primeLineAudio = () => window.MusicalAudio.preloadLocalAudio(lineAudioPath);
  sentenceSpeakButton.addEventListener("pointerenter", primeLineAudio, { once: true });
  sentenceSpeakButton.addEventListener("focus", primeLineAudio, { once: true });
  sentenceSpeakButton.addEventListener("click", () => {
    if (audioController.isSequenceActive() && card.classList.contains("is-sequence-active")) {
      audioController.stopSequence();
      return;
    }
    audioController.runUserAction(sentenceSpeakButton, async () => {
      const audioSession = analytics.audioClick({ audioType: "line", lineId: line.id });
      const didSpeak = await playFrenchAudio(lineAudioPath, line.fr, {
        rateControlled: true,
        analyticsSession: audioSession,
      });

      if (!didSpeak) {
        sentenceSpeakButton.title = "未找到法语语音";
        sentenceSpeakButton.disabled = true;
        return;
      }
    });
  });
  if (line.repeatCount) {
    const repeatBadge = document.createElement("span");
    repeatBadge.className = "repeat-badge";
    repeatBadge.textContent = `x${line.repeatCount}`;
    fr.append(document.createTextNode(" "), repeatBadge);
  }

  const frRow = document.createElement("div");
  frRow.className = "fr-row";
  frRow.append(fr, sentenceSpeakButton);

  const en = document.createElement("p");
  en.className = "en";
  en.hidden = !appState.settings.showEn;
  en.textContent = line.en;

  const zh = document.createElement("p");
  zh.className = "zh";
  zh.hidden = !appState.settings.showZh;
  zh.textContent = formatChineseLyric(line.zh);

  textBlock.append(frRow, en, zh);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const phoneticsButton = document.createElement("button");
  phoneticsButton.className = "card-action";
  phoneticsButton.classList.toggle("is-line-active", isPhoneticsExpanded);
  phoneticsButton.type = "button";
  phoneticsButton.textContent = isPhoneticsExpanded ? "收起音标" : "显示音标";
  phoneticsButton.setAttribute("aria-expanded", String(isPhoneticsExpanded));
  phoneticsButton.setAttribute("aria-pressed", String(isPhoneticsExpanded));
  phoneticsButton.addEventListener("click", () => togglePhonetics(line.id));

  const analysisButton = document.createElement("button");
  analysisButton.className = "card-action";
  analysisButton.classList.toggle("is-line-active", isExpanded);
  analysisButton.type = "button";
  analysisButton.textContent = isExpanded ? "收起解析" : "展开解析";
  analysisButton.setAttribute("aria-expanded", String(isExpanded));
  analysisButton.setAttribute("aria-pressed", String(isExpanded));
  analysisButton.addEventListener("click", () => toggleExpanded(line.id));

  actions.append(phoneticsButton, analysisButton);

  const analysis = renderAnalysis(song, line.analysis);
  analysis.hidden = !isExpanded;

  card.append(textBlock, actions, analysis);
  return card;
}

function renderAnalysis(song, analysis = {}) {
  const wrapper = document.createElement("section");
  wrapper.className = "analysis";

  const wordsSection = document.createElement("div");
  wordsSection.className = "analysis-section";
  wordsSection.innerHTML = "<h3>词汇</h3>";

  const words = document.createElement("div");
  words.className = "word-list";
  (analysis.words || []).forEach((word) => {
    const item = document.createElement("div");
    item.className = "word-item";

    const fr = document.createElement("strong");
    fr.textContent = word.fr;

    const ipa = document.createElement("span");
    ipa.className = "word-ipa";
    ipa.textContent = word.ipa || formatIpaForText(song, word.fr);

    const en = document.createElement("span");
    en.textContent = word.en;

    const zh = document.createElement("span");
    zh.textContent = word.zh;

    item.append(fr, ipa, en, zh);

    if (word.note) {
      const note = document.createElement("span");
      note.className = "word-note";
      note.textContent = word.note;
      item.append(note);
    }

    words.append(item);
  });
  wordsSection.append(words);

  const grammarSection = document.createElement("div");
  grammarSection.className = "analysis-section";
  grammarSection.innerHTML = "<h3>语法</h3>";
  grammarSection.append(createList(analysis.grammar || []));

  const backgroundSection = document.createElement("div");
  backgroundSection.className = "analysis-section";
  backgroundSection.innerHTML = "<h3>背景理解</h3>";
  const background = document.createElement("p");
  background.className = "background-text";
  background.textContent = analysis.background || "暂无解析。";
  backgroundSection.append(background);

  wrapper.append(wordsSection, grammarSection, backgroundSection);
  return wrapper;
}

function createList(items) {
  const list = document.createElement("ul");
  list.className = "analysis-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });
  return list;
}

function toggleExpanded(lineId) {
  const song = getCurrentSong();
  if (!song) {
    return;
  }

  if (appState.settings.showAnalysis) {
    trackLineDetailToggle(song, lineId, "analysis", false, "global_override");
    disableGlobalAnalysisForLine(song, lineId);
    return;
  }

  const key = expandedKey(song.id, lineId);
  let isExpanded = false;
  if (appState.expanded.has(key)) {
    appState.expanded.delete(key);
  } else {
    appState.expanded.add(key);
    isExpanded = true;
  }

  trackLineDetailToggle(song, lineId, "analysis", isExpanded, "line");
  renderCurrentSong();
}

function togglePhonetics(lineId) {
  const song = getCurrentSong();
  if (!song) {
    return;
  }

  if (appState.settings.showPhonetics) {
    trackLineDetailToggle(song, lineId, "phonetics", false, "global_override");
    disableGlobalPhoneticsForLine(song, lineId);
    return;
  }

  const key = expandedKey(song.id, lineId);
  let isExpanded = false;
  if (appState.expandedPhonetics.has(key)) {
    appState.expandedPhonetics.delete(key);
  } else {
    appState.expandedPhonetics.add(key);
    isExpanded = true;
  }

  trackLineDetailToggle(song, lineId, "phonetics", isExpanded, "line");
  renderCurrentSong();
}

function disableGlobalAnalysisForLine(song, lineId) {
  appState.settings.showAnalysis = false;
  appState.expanded = new Set(
    song.lines.map((line) => expandedKey(song.id, line.id)).filter((key) => key !== expandedKey(song.id, lineId)),
  );
  saveSettings();
  updateViewSettings();
  renderCurrentSong();
}

function disableGlobalPhoneticsForLine(song, lineId) {
  appState.settings.showPhonetics = false;
  appState.expandedPhonetics = new Set(
    song.lines.map((line) => expandedKey(song.id, line.id)).filter((key) => key !== expandedKey(song.id, lineId)),
  );
  saveSettings();
  updateViewSettings();
  renderCurrentSong();
}

function formatChineseLyric(text) {
  return text.replace(/[。.]+$/u, "");
}

function renderFrenchText(song, text, showPhonetics, line = null) {
  const fragment = document.createDocumentFragment();
  const parts = text.match(/\p{L}+(?:['']\p{L}+)*(?:-\p{L}+)*|[^\p{L}]+/gu) || [text];
  const wordParts = parts.filter((part) => /^\p{L}/u.test(part));
  const correctedParts = getCorrectedLinePhoneticParts(song, line);
  let wordIndex = 0;

  parts.forEach((part) => {
    if (/^\p{L}/u.test(part)) {
      const key = normalizeToken(part);
      const token = document.createElement("span");
      token.className = "lyric-token";

      const button = document.createElement("button");
      button.className = "lyric-word";
      button.type = "button";
      button.textContent = part;
      const currentWordIndex = wordIndex;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        showWordPopup(song, part, key, button, {
          correctedParts,
          wordIndex: currentWordIndex,
        });
      });

      const phonetic = document.createElement("span");
      phonetic.className = "word-phonetic";
      phonetic.hidden = !showPhonetics;
      phonetic.textContent = buildWordPhonetics(song, part, wordIndex, wordParts.length, correctedParts);

      token.append(button, phonetic);
      fragment.append(token);
      wordIndex += 1;
    } else {
      fragment.append(document.createTextNode(part));
    }
  });

  return fragment;
}

function getCorrectedLinePhoneticParts(song, line) {
  if (!song || !line) {
    return null;
  }

  const entry = correctedLinePhonetics[song.id]?.[line.id];
  return Array.isArray(entry?.parts) ? entry.parts : null;
}

function normalizeToken(token) {
  return token
    .toLocaleLowerCase("fr-FR")
    .replace(/[«»"“”‘'.,;:!?()]/gu, "")
    .replace(/^[-\s]+|[-\s]+$/gu, "");
}

function tokenizeFrench(text) {
  return (text.match(/\p{L}+(?:['']\p{L}+)*(?:-\p{L}+)*/gu) || [])
    .map(normalizeToken)
    .filter(Boolean);
}

function getGlossaryEntry(song, key) {
  const normalized = normalizeToken(key);
  const glossary = buildSongGlossary(song);
  const entry = findGlossaryEntry(glossary, normalized);

  if (entry) {
    return {
      ...entry,
      ipa: entry.ipa || approximateFrenchWordIpa(entry.speak || key),
      speak: entry.speak || key,
    };
  }

  return {
    ipa: approximateFrenchWordIpa(key),
    en: "not in glossary yet",
    zh: "暂未收录词义，请检查是否为变位或识别错误",
    speak: key,
  };
}

function findGlossaryEntry(glossary, token) {
  const normalized = normalizeToken(token);
  const stripped = stripElisionPrefix(normalized);
  const direct = glossary[normalized] || glossary[stripped];

  if (direct) {
    return direct;
  }

  const singular = findSingularGlossaryEntry(glossary, normalized, stripped);
  if (singular) {
    return singular;
  }

  const derived = findDerivedVerbGlossaryEntry(glossary, normalized, stripped);
  if (derived) {
    return derived;
  }

  const inflected = INFLECTED_GLOSSARY_FORMS[normalized] || INFLECTED_GLOSSARY_FORMS[stripped];
  if (!inflected) {
    return null;
  }

  const lemmaEntry = glossary[inflected.lemma];
  if (!lemmaEntry) {
    return null;
  }

  return {
    ...lemmaEntry,
    ipa: inflected.ipa || lemmaEntry.ipa,
    en: inflected.en || lemmaEntry.en,
    zh: inflected.zh || lemmaEntry.zh,
    note: inflected.note || lemmaEntry.note,
    speak: normalized,
  };
}

function findDerivedVerbGlossaryEntry(glossary, normalized, stripped) {
  const candidates = derivedVerbLemmaCandidates(normalized, stripped);
  const lemma = candidates.find((candidate) => glossary[candidate]);

  if (!lemma) {
    return null;
  }

  const entry = glossary[lemma];

  return {
    ...entry,
    ipa: approximateFrenchWordIpa(normalized),
    note: entry.note || `来自变位，原形 ${lemma}`,
    speak: normalized,
  };
}

function derivedVerbLemmaCandidates(...tokens) {
  const candidates = new Set();

  tokens.filter(Boolean).forEach((token) => {
    if (token.length <= 3) {
      return;
    }

    if (token.endsWith("ez")) {
      candidates.add(`${token.slice(0, -2)}er`);
    }

    if (token.endsWith("ons")) {
      candidates.add(`${token.slice(0, -3)}er`);
    }

    if (token.endsWith("ent")) {
      candidates.add(`${token.slice(0, -3)}er`);
    }

    if (token.endsWith("es")) {
      candidates.add(`${token.slice(0, -2)}er`);
    }

    if (token.endsWith("e")) {
      candidates.add(`${token.slice(0, -1)}er`);
    }
  });

  return [...candidates];
}

function findSingularGlossaryEntry(glossary, normalized, stripped) {
  const singular = singularGlossaryCandidates(normalized, stripped)
    .map((candidate) => glossary[candidate])
    .find(Boolean);

  if (!singular) {
    return null;
  }

  return {
    ...singular,
    ipa: singular.ipa || approximateFrenchWordIpa(normalized),
    speak: normalized,
  };
}

function singularGlossaryCandidates(...tokens) {
  const candidates = new Set();

  tokens.filter(Boolean).forEach((token) => {
    if (token.endsWith("aux") && token.length > 4) {
      candidates.add(`${token.slice(0, -3)}al`);
    }

    if (/[sx]$/u.test(token) && token.length > 3) {
      candidates.add(token.slice(0, -1));
    }
  });

  return [...candidates];
}

function buildSongGlossary(song) {
  if (songGlossaryCache.has(song)) {
    return songGlossaryCache.get(song);
  }

  const glossary = {
    ...COMMON_WORD_GLOSSARY,
    ...(song.wordGlossary || {}),
  };

  song.lines.forEach((line) => {
    (line.analysis?.words || []).forEach((word) => {
      const entry = {
        ipa: word.ipa || approximateFrenchPhraseIpa(word.fr),
        en: word.en,
        zh: word.zh,
        note: word.note || (word.fr.includes(" ") ? `来自短语 ${word.fr}` : ""),
        speak: word.fr,
      };

      addGlossaryEntry(glossary, normalizeToken(word.fr), entry);
      getTokenGlossaryEntries(word, entry).forEach(({ token, entry: tokenEntry }) => {
        addGlossaryEntry(glossary, token, tokenEntry);
      });
    });
  });

  songGlossaryCache.set(song, glossary);
  return glossary;
}

function addGlossaryEntry(glossary, key, entry) {
  if (key && !glossary[key]) {
    glossary[key] = entry;
  }
}

function getTokenGlossaryEntries(word, phraseEntry) {
  const rawTokens = splitGlossaryRawTokens(word.fr);

  if (rawTokens.length === 0) {
    return [];
  }

  if (rawTokens.length === 1) {
    return [{ token: stripElisionPrefix(normalizeToken(rawTokens[0])), entry: phraseEntry }];
  }

  const slashParts = splitParallelGlossaryParts(word, rawTokens);

  return rawTokens
    .map((rawToken, index) => {
      const token = stripElisionPrefix(normalizeToken(rawToken));

      if (!token) {
        return null;
      }

      const part = slashParts?.[index];
      const tokenEntry = {
        ...phraseEntry,
        ipa: approximateFrenchWordIpa(rawToken),
        en: part?.en || phraseEntry.en,
        zh: part?.zh || phraseEntry.zh,
        note: part ? "" : `来自短语 ${word.fr}`,
        speak: rawToken,
      };

      return { token, entry: tokenEntry };
    })
    .filter(Boolean);
}

function splitParallelGlossaryParts(word, rawTokens) {
  if (!word.fr.includes("/")) {
    return null;
  }

  const enParts = splitSlashText(word.en);
  const zhParts = splitSlashText(word.zh);

  if (enParts.length !== rawTokens.length || zhParts.length !== rawTokens.length) {
    return null;
  }

  return rawTokens.map((_, index) => ({
    en: enParts[index],
    zh: zhParts[index],
  }));
}

function splitSlashText(text = "") {
  return text
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitGlossaryRawTokens(text) {
  return text.match(/\p{L}+(?:['']\p{L}+)*(?:-\p{L}+)*/gu) || [];
}

function splitGlossaryTokens(text) {
  return (text.match(/\p{L}+/gu) || [])
    .map(normalizeToken)
    .map(stripElisionPrefix)
    .filter(Boolean);
}

function stripElisionPrefix(token) {
  return token.replace(/^(?:j|l|d|n|m|t|s|c|qu)(?=\p{L}{2,})/u, "");
}

function formatIpaForText(song, text) {
  const glossary = buildSongGlossary(song);
  const ipa = tokenizeFrench(text)
    .map((token) => findGlossaryEntry(glossary, token)?.ipa)
    .filter(Boolean);

  return ipa.length ? ipa.join(" ") : "—";
}

function buildWordPhonetics(song, text, index, total, correctedParts = null) {
  if (Array.isArray(correctedParts) && correctedParts.length) {
    return formatCorrectedWordPhonetics(correctedParts, index);
  }

  const glossary = buildSongGlossary(song);
  const normalized = normalizeToken(text);
  const entry = findGlossaryEntry(glossary, normalized);
  const ipa = trimIpaSlashes(entry?.ipa || approximateFrenchWordIpa(text));
  const prefix = index === 0 ? "/ " : "";
  const suffix = index === total - 1 ? " /" : "";
  return `${prefix}${ipa}${suffix}`;
}

function formatCorrectedWordPhonetics(parts, index) {
  const ipa = parts[index] || "";
  if (!ipa) {
    return "";
  }

  const first = parts.findIndex(Boolean);
  const last = parts.reduce((result, part, partIndex) => (part ? partIndex : result), -1);
  const prefix = index === first ? "/ " : "";
  const suffix = index === last ? " /" : "";
  return `${prefix}${ipa}${suffix}`;
}

function getCorrectedWordIpa(parts, index) {
  const ipa = Array.isArray(parts) ? parts[index] : "";
  return ipa ? `/${trimIpaSlashes(ipa)}/` : "";
}

function approximateFrenchPhraseIpa(text) {
  return `/${(text.match(/\p{L}+(?:['']\p{L}+)*(?:-\p{L}+)*/gu) || [])
    .map(approximateFrenchWordIpa)
    .map(trimIpaSlashes)
    .join(" ")}/`;
}

function approximateFrenchWordIpa(word) {
  const normalized = normalizeToken(word);
  const common = COMMON_WORD_GLOSSARY[normalized] || COMMON_WORD_GLOSSARY[stripElisionPrefix(normalized)];
  if (common?.ipa) {
    return common.ipa;
  }

  let value = normalized
    .replace(/^h/u, "")
    .replace(/œu/g, "œ")
    .replace(/oeu/g, "œ")
    .replace(/eaux?/g, "o")
    .replace(/au/g, "o")
    .replace(/ai|ei/g, "ɛ")
    .replace(/ou/g, "u")
    .replace(/oi/g, "wa")
    .replace(/eu/g, "ø")
    .replace(/ch/g, "ʃ")
    .replace(/gn/g, "ɲ")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/ç/g, "s")
    .replace(/c(?=e|i|y)/g, "s")
    .replace(/c/g, "k")
    .replace(/g(?=e|i|y)/g, "ʒ")
    .replace(/g/g, "ɡ")
    .replace(/j/g, "ʒ")
    .replace(/r/g, "ʁ")
    .replace(/ill/g, "ij")
    .replace(/y/g, "i");

  value = value
    .replace(/(ain|ein|in|im|yn|ym)$/g, "ɛ̃")
    .replace(/(ain|ein|in|im|yn|ym)(?=[^aeiouyàâäéèêëîïôöùûüœ])/g, "ɛ̃")
    .replace(/(an|am|en|em)(?=[^aeiouyàâäéèêëîïôöùûüœ]|$)/g, "ɑ̃")
    .replace(/(on|om)(?=[^aeiouyàâäéèêëîïôöùûüœ]|$)/g, "ɔ̃")
    .replace(/(un|um)(?=[^aeiouyàâäéèêëîïôöùûüœ]|$)/g, "œ̃");

  value = value
    .replace(/[sxztdp]$/u, "")
    .replace(/e$/u, "")
    .replace(/é/g, "e")
    .replace(/[èêë]/g, "ɛ")
    .replace(/[àâä]/g, "a")
    .replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o")
    .replace(/[ùûü]/g, "y");

  return `/${value || normalized}/`;
}

function trimIpaSlashes(ipa) {
  return ipa.replace(/^\/|\/$/g, "");
}

function createWordPopup() {
  const popup = document.createElement("aside");
  popup.className = "word-popover";
  popup.hidden = true;
  popup.setAttribute("aria-live", "polite");
  return popup;
}

function bindPopupDismissal() {
  document.addEventListener("click", (event) => {
    if (!wordPopup.hidden && !wordPopup.contains(event.target)) {
      hideWordPopup();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideWordPopup();
    }
  });
}

function bindBackToTop() {
  const updateBackToTop = () => {
    refs.backToTop.hidden = window.scrollY < 360;
  };

  refs.backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", updateBackToTop, { passive: true });
  updateBackToTop();
}

function enterAnalyticsSong(song) {
  analytics.songRendered(song);
}

function trackDisplayToggle(key) {
  const featureNames = {
    showZh: "translation_toggle",
    showEn: "english_toggle",
    showAnalysis: "analysis_toggle",
    showPhonetics: "ipa_toggle",
  };
  if (featureNames[key]) analytics.featureUse(featureNames[key]);
}

function trackLineDetailToggle(song, lineId, detailType) {
  analytics.featureUse(detailType === "analysis" ? "analysis_toggle" : "ipa_toggle");
}

function bindRougeCursor() {
  const canvas = document.querySelector("#rougeCursor");
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!canvas || !canHover.matches || reduceMotion.matches) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  document.body.classList.add("has-rouge-cursor");
  canvas.hidden = false;

  const backgroundStars = [];
  const particles = [];
  const mouse = { x: -100, y: -100, targetX: -100, targetY: -100 };
  let rafId = 0;
  let isHoveringInteractive = false;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(window.innerWidth * dpr);
    canvas.height = Math.ceil(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawFourPointStar(cx, cy, outerRadius, innerRadius, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    ctx.lineTo(cx + innerRadius, cy - innerRadius);
    ctx.lineTo(cx + outerRadius, cy);
    ctx.lineTo(cx + innerRadius, cy + innerRadius);
    ctx.lineTo(cx, cy + outerRadius);
    ctx.lineTo(cx - innerRadius, cy + innerRadius);
    ctx.lineTo(cx - outerRadius, cy);
    ctx.lineTo(cx - innerRadius, cy - innerRadius);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  class BackgroundStar {
    constructor() {
      this.x = Math.random() * window.innerWidth;
      this.y = Math.random() * window.innerHeight;
      this.size = Math.random() * 1.5 + 0.5;
      this.alpha = Math.random();
      this.speed = Math.random() * 0.008 + 0.003;
    }

    update() {
      this.alpha += this.speed;
      if (this.alpha > 1 || this.alpha < 0) this.speed = -this.speed;
    }

    draw() {
      ctx.beginPath();
      ctx.fillStyle = `rgba(232, 210, 166, ${Math.max(0, this.alpha * 0.52)})`;
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  class BlurCircleParticle {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.radius = Math.random() * 7 + 4;
      this.vx = (Math.random() - 0.5) * 1.6;
      this.vy = (Math.random() - 0.5) * 1.6 - 0.3;
      this.alpha = 1;
      this.decay = Math.random() * 0.025 + 0.015;
      this.colorRGB = Math.random() > 0.35 ? "232, 210, 166" : "111, 17, 24";
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.alpha -= this.decay;
    }

    draw() {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
      gradient.addColorStop(0, `rgba(${this.colorRGB}, ${this.alpha * 0.85})`);
      gradient.addColorStop(0.3, `rgba(${this.colorRGB}, ${this.alpha * 0.4})`);
      gradient.addColorStop(1, `rgba(${this.colorRGB}, 0)`);
      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function handleMouseMove(event) {
    mouse.targetX = event.clientX;
    mouse.targetY = event.clientY;
    isHoveringInteractive = Boolean(event.target.closest("button, a, select, .word-token, .speak-inline"));

    if (Math.abs(mouse.x - mouse.targetX) > 0.5) {
      for (let index = 0; index < 2; index += 1) {
        particles.push(new BlurCircleParticle(mouse.x, mouse.y));
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    backgroundStars.forEach((star) => {
      star.update();
      star.draw();
    });

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.update();
      if (particle.alpha <= 0) {
        particles.splice(index, 1);
      } else {
        particle.draw();
      }
    }

    mouse.x += (mouse.targetX - mouse.x) * 0.45;
    mouse.y += (mouse.targetY - mouse.y) * 0.45;

    if (mouse.targetX !== -100) {
      drawFourPointStar(mouse.x, mouse.y, 15, 2.5, isHoveringInteractive ? "#c8aa83" : "#fbe9a3");
    }

    rafId = requestAnimationFrame(animate);
  }

  for (let index = 0; index < 40; index += 1) {
    backgroundStars.push(new BackgroundStar());
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("pagehide", () => cancelAnimationFrame(rafId), { once: true });
  resizeCanvas();
  animate();
}

function showWordPopup(song, displayWord, key, anchor, phoneticContext = {}) {
  const entry = getGlossaryEntry(song, key);
  const correctedIpa = getCorrectedWordIpa(phoneticContext.correctedParts, phoneticContext.wordIndex);
  const displayEntry = correctedIpa ? { ...entry, ipa: correctedIpa } : entry;
  wordPopup.innerHTML = "";

  const popoverHead = document.createElement("div");
  popoverHead.className = "popover-head";

  const title = document.createElement("strong");
  title.className = "popover-word";
  title.textContent = displayWord;

  const ipa = document.createElement("span");
  ipa.className = "popover-ipa";
  ipa.textContent = displayEntry.ipa;

  const zh = document.createElement("span");
  zh.className = "popover-meaning";
  zh.textContent = entry.zh;

  const en = document.createElement("span");
  en.className = "popover-en";
  en.textContent = entry.en || "";

  const speakButton = document.createElement("button");
  speakButton.className = "popover-speak";
  speakButton.type = "button";
  speakButton.title = "播放发音";
  speakButton.setAttribute("aria-label", `播放发音：${displayWord}`);
  speakButton.append(createSpeakerIcon());
  const wordAudioPath = getWordAudioPath(entry?.speak || displayWord);
  window.MusicalAudio.preloadLocalAudio(wordAudioPath);
  speakButton.addEventListener("click", (event) => {
    event.stopPropagation();
    audioController.runUserAction(speakButton, async () => {
      const audioSession = analytics.audioClick({ audioType: "word", lineId: "" });
      const speakText = entry?.speak || displayWord;
      const didSpeak = await playFrenchAudio(wordAudioPath, speakText, { analyticsSession: audioSession });

      if (!didSpeak) {
        speakButton.title = "未找到法语语音";
        speakButton.disabled = true;
        return;
      }
    });
  });

  popoverHead.append(title, ipa, speakButton);
  wordPopup.append(popoverHead, en, zh);
  wordPopup.hidden = false;
  positionWordPopup(anchor);
}

function createSpeakerIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  const speaker = document.createElementNS("http://www.w3.org/2000/svg", "path");
  speaker.setAttribute("d", "M4 9v6h4l5 4V5L8 9H4z");

  const wave = document.createElementNS("http://www.w3.org/2000/svg", "path");
  wave.setAttribute("d", "M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12");

  icon.append(speaker, wave);
  return icon;
}

function positionWordPopup(anchor) {
  const rect = anchor.getBoundingClientRect();
  const popupRect = wordPopup.getBoundingClientRect();
  const margin = 12;
  const top = window.scrollY + rect.bottom + 8;
  const left = Math.min(
    window.scrollX + rect.left,
    window.scrollX + document.documentElement.clientWidth - popupRect.width - margin,
  );

  wordPopup.style.top = `${top}px`;
  wordPopup.style.left = `${Math.max(margin, left)}px`;
}

function hideWordPopup() {
  wordPopup.hidden = true;
}

async function playFrenchAudio(src, fallbackText, { rateControlled = false, analyticsSession = null } = {}) {
  if (src) {
    try {
      await playLocalAudio(src, false, { rateControlled, analyticsSession });
      return true;
    } catch {
      // Fall back to speech synthesis when the generated file is missing.
    }
  }

  return speakFrench(fallbackText, false, { rateControlled, analyticsSession });
}

function stopCurrentPlayback() {
  if (audioState.finish) {
    const finish = audioState.finish;
    audioState.finish = null;
    finish();
  }
  if (audioState.current) {
    audioState.current.pause();
    audioState.current.currentTime = 0;
    audioState.current = null;
  }
  audioState.rateControlled = false;
  if (audioState.speechFinish) {
    const finish = audioState.speechFinish;
    audioState.speechFinish = null;
    finish();
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  audioState.preload = null;
}

function pauseCurrentPlayback() {
  if (audioState.current && !audioState.current.paused) audioState.current.pause();
  if ("speechSynthesis" in window && window.speechSynthesis.speaking) window.speechSynthesis.pause();
}

function resumeCurrentPlayback() {
  if (audioState.current?.paused) {
    Promise.resolve(audioState.current.play()).catch(() => audioController.stopSequence());
  }
  if ("speechSynthesis" in window && window.speechSynthesis.paused) window.speechSynthesis.resume();
}

function playLocalAudio(src, waitForEnd, { rateControlled = false, analyticsSession = null } = {}) {
  if (!src) {
    return Promise.reject(new Error("Missing audio source"));
  }
  stopCurrentPlayback();
  const audio = window.MusicalAudio.getCachedAudio(src);
  if (!audio) return Promise.reject(new Error("Audio playback unavailable"));
  const rate = rateControlled ? pageTools.getRate() : 1;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  audioState.current = audio;
  audioState.rateControlled = rateControlled;
  if (!waitForEnd) {
    return Promise.resolve(audio.play()).then(() => {
      if (analyticsSession) {
        analytics.audioStart(analyticsSession);
        audio.addEventListener("ended", () => analytics.audioComplete(analyticsSession), { once: true });
      }
    });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      if (audioState.current === audio) audioState.current = null;
      if (audioState.finish === stopAndResolve) audioState.finish = null;
      if (error) reject(error);
      else resolve();
    };
    const handleEnded = () => {
      if (analyticsSession) analytics.audioComplete(analyticsSession);
      finish();
    };
    const handleError = () => finish(new Error("Audio playback failed"));
    const stopAndResolve = () => finish();
    audioState.finish = stopAndResolve;
    audio.addEventListener("ended", handleEnded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    Promise.resolve(audio.play())
      .then(() => {
        if (analyticsSession) analytics.audioStart(analyticsSession);
      })
      .catch(finish);
  });
}

function getLineAudioPath(song, line) {
  return `audio/lines/${encodeURIComponent(song.id)}/${encodeURIComponent(line.id)}.mp3`;
}

function getWordAudioPath(text) {
  return `audio/words/${hashFrenchAudioText(text)}.mp3`;
}

function hashFrenchAudioText(text) {
  const normalized = normalizeFrenchAudioText(text);
  let hash = 5381;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(index);
  }

  return `fr-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeFrenchAudioText(text) {
  return String(text || "")
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’‘`]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function speakFrench(text, waitForEnd, { rateControlled = false, analyticsSession = null } = {}) {
  if (!("speechSynthesis" in window)) {
    return Promise.resolve(false);
  }

  const frenchVoice = findFrenchVoice(window.speechSynthesis.getVoices());

  if (!frenchVoice) {
    return Promise.resolve(false);
  }

  speechState.frenchVoice = frenchVoice;
  stopCurrentPlayback();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  utterance.voice = frenchVoice;
  utterance.rate = 0.86 * (rateControlled ? pageTools.getRate() : 1);
  utterance.onstart = () => {
    if (analyticsSession) analytics.audioStart(analyticsSession);
  };
  if (!waitForEnd) {
    utterance.onend = () => {
      if (analyticsSession) analytics.audioComplete(analyticsSession);
    };
    window.speechSynthesis.speak(utterance);
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      if (audioState.speechFinish === stopAndResolve) audioState.speechFinish = null;
      resolve(success);
    };
    const stopAndResolve = () => finish(true);
    audioState.speechFinish = stopAndResolve;
    utterance.onend = () => {
      if (analyticsSession) analytics.audioComplete(analyticsSession);
      finish(true);
    };
    utterance.onerror = () => finish(false);
    window.speechSynthesis.speak(utterance);
  });
}

async function playLineToEnd(song, line) {
  const analyticsSession = analytics.createAudioSession({ audioType: "line", lineId: line.id });
  try {
    await playLocalAudio(getLineAudioPath(song, line), true, { rateControlled: true, analyticsSession });
  } catch {
    const didSpeak = await speakFrench(line.fr, true, { rateControlled: true, analyticsSession });
    if (!didSpeak) throw new Error("No French line audio found");
  }
}

function toggleCurrentSongPlayback() {
  const song = getCurrentSong();
  if (!song?.lines.length) return;
  const wasActive = audioController.isSequenceActive();
  const playlistSession = wasActive ? null : analytics.createAudioSession({ audioType: "playlist", lineId: "" });
  const sequence = audioController.toggleSequence({
    button: refs.songPlayButton,
    items: song.lines,
    playItem: (line) => playLineToEnd(song, line),
    gapMs: window.MusicalAudio.SEQUENCE_GAP_MS / pageTools.getRate(),
    onItemStart: (line, index, nextLine) => {
      setSequenceHighlight(line.id, index, song.lines.length);
      if (nextLine) preloadLineAudio(song, nextLine);
    },
    onComplete: () => {
      if (playlistSession) analytics.audioComplete(playlistSession);
      analytics.featureUse("playlist_complete");
    },
  });
  if (!wasActive && audioController.isSequenceActive()) {
    analytics.audioClick(playlistSession);
    analytics.audioStart(playlistSession);
    analytics.featureUse("playlist_start");
  }
  return sequence;
}

function preloadLineAudio(song, line) {
  const audio = window.MusicalAudio.preloadLocalAudio(getLineAudioPath(song, line));
  audioState.preload = audio;
}

function setSequenceHighlight(lineId, index, total) {
  clearSequenceHighlight();
  const card = document.getElementById(lineId);
  if (card) {
    card.classList.add("is-sequence-active");
    const button = card.querySelector(".sentence-speak");
    button?.classList.add("is-sequence-stop");
    button?.setAttribute("aria-label", "停止全曲播放");
    button?.setAttribute("title", "停止全曲播放");
  }
  pageTools.setProgress(index, total);
  followSequenceCard(card);
}

function followSequenceCard(card) {
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const topBoundary = Math.min(180, window.innerHeight * 0.24);
  const bottomBoundary = window.innerHeight - Math.min(150, window.innerHeight * 0.2);
  if (rect.top >= topBoundary && rect.bottom <= bottomBoundary) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
}

function clearSequenceHighlight() {
  refs.lyricsList?.querySelectorAll(".lyric-card.is-sequence-active").forEach((card) => {
    card.classList.remove("is-sequence-active");
    const button = card.querySelector(".sentence-speak");
    button?.classList.remove("is-sequence-stop");
    button?.setAttribute("aria-label", "播放整句发音");
    button?.setAttribute("title", "播放整句发音");
  });
}

function setupSpeechVoices() {
  if (!("speechSynthesis" in window)) {
    return;
  }

  const refreshFrenchVoice = () => {
    speechState.frenchVoice = findFrenchVoice(window.speechSynthesis.getVoices());
  };

  refreshFrenchVoice();

  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", refreshFrenchVoice);
  } else {
    window.speechSynthesis.onvoiceschanged = refreshFrenchVoice;
  }
}

function findFrenchVoice(voices) {
  const candidates = [...voices].filter((voice) => {
    return voice.lang && voice.lang.toLocaleLowerCase("fr-FR").startsWith("fr");
  });

  return (
    candidates.find((voice) => voice.lang.toLocaleLowerCase("fr-FR") === "fr-fr") ||
    candidates.find((voice) => /français|french/i.test(voice.name)) ||
    candidates[0] ||
    null
  );
}
