import { Language } from './types';

interface LandingCopy {
  galleryRestoreTitle: string;
  galleryIntro: string;
  realResults: string;
  compareLabel: string;
  restoreExamples: string[];
  howTitle: string;
  howIntro: string;
  steps: Array<{ title: string; description: string }>;
  pricingTitle: string;
  pricingIntro: string;
  freePlanName: string;
  freePlanDesc: string;
  oneTimePayment: string;
  paidFeaturesTitle: string;
  paidFeatures: string[];
  privacyTitle: string;
  privacyIntro: string;
  privacyPoints: string[];
  faqTitle: string;
  faqs: Array<{ question: string; answer: string }>;
  finalRestoreTitle: string;
  finalRestoreCta: string;
  sourcePhoto: string;
  startFree: string;
  choosePackage: string;
}

export const LANDING_CONTENT: Record<Language, LandingCopy> = {
  [Language.EN]: {
    galleryRestoreTitle: 'Real restoration results',
    galleryIntro: 'These examples were created by ShotMe from licensed source photographs. Drag the divider to compare.',
    realResults: 'Created with ShotMe',
    compareLabel: 'Move the divider to compare before and after',
    restoreExamples: ['Faded studio portrait', 'Mother and grandmother, 1930s', 'Family photograph from the 1940s'],
    howTitle: 'From photo to result in three steps',
    howIntro: 'No editor, prompt, or special skill is required in the free version.',
    steps: [
      { title: 'Upload a photo', description: 'Choose an image from your phone or computer.' },
      { title: 'Automatic restoration', description: 'ShotMe repairs damage, restores clarity, and adds period-aware color.' },
      { title: 'Download', description: 'Review the finished image and save it to your device.' },
    ],
    pricingTitle: 'Clear pricing before you start',
    pricingIntro: 'Try ten generations free. Paid packs are one-time purchases, not subscriptions.',
    freePlanName: 'Free trial',
    freePlanDesc: '10 generations without email or bank card',
    oneTimePayment: 'One-time payment',
    paidFeaturesTitle: 'Paid packs also include',
    paidFeatures: ['Private gallery', 'Manual corrections', 'Voice corrections'],
    privacyTitle: 'Your photo remains yours',
    privacyIntro: 'The original is used to process your request and is not intentionally retained after it is complete.',
    privacyPoints: ['The original file is never overwritten', 'Paid results can be stored in your private gallery', 'Stripe processes payments; ShotMe does not store full card details'],
    faqTitle: 'Questions before uploading',
    faqs: [
      { question: 'Will the original photo change?', answer: 'No. ShotMe creates a separate result and keeps the uploaded original available for comparison during the session.' },
      { question: 'Will the face remain the same?', answer: 'The model is instructed to preserve identity and facial features, but AI accuracy cannot be guaranteed for every damaged or very small image.' },
      { question: 'Can I print the result?', answer: 'Yes, but print quality depends on the size and clarity of the source photo and the generated output.' },
      { question: 'What if I do not like the result?', answer: 'Use another free attempt with a clearer source. Failed or blocked processing attempts are not deducted.' },
    ],
    finalRestoreTitle: 'Bring an important family photograph back to life',
    finalRestoreCta: 'Restore my photo free',
    sourcePhoto: 'Source photo',
    startFree: 'Start free',
    choosePackage: 'Choose package',
  },
  [Language.ET]: {
    galleryRestoreTitle: 'Päris taastamistulemused',
    galleryIntro: 'Need näited lõi ShotMe litsentsitud algfotodest. Võrdlemiseks liiguta eraldusjoont.',
    realResults: 'Loodud ShotMe abil',
    compareLabel: 'Liiguta joont, et võrrelda enne ja pärast',
    restoreExamples: ['Pleekinud stuudioportree', 'Ema ja vanaema, 1930. aastad', '1940. aastate perefoto'],
    howTitle: 'Fotost tulemuseni kolme sammuga',
    howIntro: 'Tasuta versioonis pole vaja fototöötlust, prompti ega erioskusi.',
    steps: [
      { title: 'Laadi foto üles', description: 'Vali pilt telefonist või arvutist.' },
      { title: 'Automaatne taastamine', description: 'ShotMe parandab kahjustused, taastab teravuse ja lisab ajastutruud värvid.' },
      { title: 'Laadi alla', description: 'Vaata tulemus üle ja salvesta see seadmesse.' },
    ],
    pricingTitle: 'Selge hind enne alustamist',
    pricingIntro: 'Proovi kümme genereerimist tasuta. Tasulised paketid on ühekordsed ostud, mitte tellimused.',
    freePlanName: 'Tasuta proov',
    freePlanDesc: '10 genereerimist ilma e-posti ja pangakaardita',
    oneTimePayment: 'Ühekordne makse',
    paidFeaturesTitle: 'Tasulistes pakettides ka',
    paidFeatures: ['Privaatne galerii', 'Käsitsi parandused', 'Häälparandused'],
    privacyTitle: 'Sinu foto jääb sinu omaks',
    privacyIntro: 'Originaali kasutatakse päringu töötlemiseks ja seda ei säilitata tahtlikult pärast päringu lõppu.',
    privacyPoints: ['Originaalfaili ei kirjutata üle', 'Tasulised tulemused saab salvestada privaatsesse galeriisse', 'Makseid töötleb Stripe; ShotMe ei salvesta kaardi täisandmeid'],
    faqTitle: 'Küsimused enne üleslaadimist',
    faqs: [
      { question: 'Kas originaalfoto muutub?', answer: 'Ei. ShotMe loob eraldi tulemuse ja hoiab originaali seansi ajal võrdlemiseks.' },
      { question: 'Kas nägu jääb samaks?', answer: 'Mudelile antakse käsk säilitada isik ja näojooned, kuid väga kahjustatud või väikeste fotode puhul ei saa AI täpsust alati garanteerida.' },
      { question: 'Kas tulemust saab printida?', answer: 'Jah, kuid trükikvaliteet sõltub algfoto ja loodud faili suurusest ning selgusest.' },
      { question: 'Mis siis, kui tulemus ei meeldi?', answer: 'Proovi selgema algfotoga uuesti. Ebaõnnestunud või blokeeritud katset ei arvestata maha.' },
    ],
    finalRestoreTitle: 'Anna olulisele perefotole uus elu',
    finalRestoreCta: 'Taasta minu foto tasuta',
    sourcePhoto: 'Algfoto',
    startFree: 'Alusta tasuta',
    choosePackage: 'Vali pakett',
  },
  [Language.RU]: {
    galleryRestoreTitle: 'Настоящие результаты восстановления',
    galleryIntro: 'Эти примеры созданы в ShotMe из лицензированных исходных фотографий. Передвигайте линию для сравнения.',
    realResults: 'Создано в ShotMe',
    compareLabel: 'Передвигайте линию, чтобы сравнить до и после',
    restoreExamples: ['Выцветший студийный портрет', 'Мать и бабушка, 1930-е годы', 'Семейное фото 1940-х годов'],
    howTitle: 'От фотографии до результата за три шага',
    howIntro: 'В бесплатной версии не нужен редактор, текстовый запрос или специальные навыки.',
    steps: [
      { title: 'Загрузите фотографию', description: 'Выберите снимок на телефоне или компьютере.' },
      { title: 'Автоматическое восстановление', description: 'ShotMe убирает повреждения, возвращает чёткость и добавляет цвета эпохи.' },
      { title: 'Скачайте', description: 'Проверьте готовое изображение и сохраните его на устройство.' },
    ],
    pricingTitle: 'Понятная цена до начала работы',
    pricingIntro: 'Попробуйте десять генераций бесплатно. Платные пакеты покупаются один раз, это не подписка.',
    freePlanName: 'Бесплатная проба',
    freePlanDesc: '10 генераций без email и банковской карты',
    oneTimePayment: 'Разовая оплата',
    paidFeaturesTitle: 'В платных пакетах также есть',
    paidFeatures: ['Личная галерея', 'Ручные правки', 'Голосовые правки'],
    privacyTitle: 'Ваша фотография остаётся вашей',
    privacyIntro: 'Оригинал используется для обработки запроса и намеренно не сохраняется после её завершения.',
    privacyPoints: ['Исходный файл никогда не перезаписывается', 'Платные результаты можно хранить в личной галерее', 'Оплату обрабатывает Stripe; ShotMe не хранит полные данные карты'],
    faqTitle: 'Вопросы перед загрузкой',
    faqs: [
      { question: 'Изменится ли оригинальная фотография?', answer: 'Нет. ShotMe создаёт отдельный результат, а оригинал остаётся доступен для сравнения во время сеанса.' },
      { question: 'Лицо останется тем же?', answer: 'Модель получает указание сохранять личность и черты лица, но точность AI нельзя гарантировать для каждого сильно повреждённого или очень маленького снимка.' },
      { question: 'Можно ли распечатать результат?', answer: 'Да, но качество печати зависит от размера и чёткости исходника и созданного файла.' },
      { question: 'Что делать, если результат не понравился?', answer: 'Попробуйте ещё раз с более чётким исходником. Неудачная или заблокированная обработка не списывается.' },
    ],
    finalRestoreTitle: 'Верните к жизни важную семейную фотографию',
    finalRestoreCta: 'Восстановить моё фото бесплатно',
    sourcePhoto: 'Исходная фотография',
    startFree: 'Начать бесплатно',
    choosePackage: 'Выбрать пакет',
  },
  [Language.LV]: {
    galleryRestoreTitle: 'Īsti atjaunošanas rezultāti',
    galleryIntro: 'Šos piemērus ShotMe izveidoja no licencētiem avota foto. Velciet dalītāju, lai salīdzinātu.',
    realResults: 'Izveidots ar ShotMe',
    compareLabel: 'Velciet līniju, lai salīdzinātu pirms un pēc',
    restoreExamples: ['Izbalējis studijas portrets', 'Māte un vecmāmiņa, 1930. gadi', '1940. gadu ģimenes foto'],
    howTitle: 'No foto līdz rezultātam trīs soļos',
    howIntro: 'Bezmaksas versijā nav vajadzīgs redaktors, teksta pieprasījums vai īpašas prasmes.',
    steps: [
      { title: 'Augšupielādējiet foto', description: 'Izvēlieties attēlu tālrunī vai datorā.' },
      { title: 'Automātiska atjaunošana', description: 'ShotMe novērš bojājumus, atjauno asumu un pievieno laikmetam atbilstošas krāsas.' },
      { title: 'Lejupielādējiet', description: 'Pārbaudiet gatavo attēlu un saglabājiet to ierīcē.' },
    ],
    pricingTitle: 'Skaidra cena pirms darba sākuma',
    pricingIntro: 'Izmēģiniet desmit ģenerācijas bez maksas. Maksas paketes ir vienreizēji pirkumi, nevis abonements.',
    freePlanName: 'Bezmaksas izmēģinājums',
    freePlanDesc: '10 ģenerācijas bez e-pasta un bankas kartes',
    oneTimePayment: 'Vienreizējs maksājums',
    paidFeaturesTitle: 'Maksas paketēs arī',
    paidFeatures: ['Privāta galerija', 'Manuāli labojumi', 'Balss labojumi'],
    privacyTitle: 'Jūsu foto paliek jūsu',
    privacyIntro: 'Oriģināls tiek izmantots pieprasījuma apstrādei un pēc tās pabeigšanas netiek apzināti saglabāts.',
    privacyPoints: ['Oriģinālais fails netiek pārrakstīts', 'Maksas rezultātus var glabāt privātā galerijā', 'Maksājumus apstrādā Stripe; ShotMe neglabā pilnus kartes datus'],
    faqTitle: 'Jautājumi pirms augšupielādes',
    faqs: [
      { question: 'Vai oriģinālais foto mainīsies?', answer: 'Nē. ShotMe izveido atsevišķu rezultātu un sesijas laikā saglabā oriģinālu salīdzināšanai.' },
      { question: 'Vai seja paliks tā pati?', answer: 'Modelim tiek norādīts saglabāt identitāti un sejas vaibstus, taču ļoti bojātiem vai maziem foto AI precizitāti nevar garantēt.' },
      { question: 'Vai rezultātu var izdrukāt?', answer: 'Jā, bet drukas kvalitāte ir atkarīga no avota un izveidotā faila izmēra un skaidrības.' },
      { question: 'Ko darīt, ja rezultāts nepatīk?', answer: 'Mēģiniet vēlreiz ar skaidrāku foto. Neveiksmīgs vai bloķēts mēģinājums netiek atskaitīts.' },
    ],
    finalRestoreTitle: 'Atdzīviniet svarīgu ģimenes fotogrāfiju',
    finalRestoreCta: 'Atjaunot manu foto bez maksas',
    sourcePhoto: 'Avota foto',
    startFree: 'Sākt bez maksas',
    choosePackage: 'Izvēlēties paketi',
  },
  [Language.LT]: {
    galleryRestoreTitle: 'Tikri atkūrimo rezultatai',
    galleryIntro: 'Šiuos pavyzdžius ShotMe sukūrė iš licencijuotų pradinių nuotraukų. Vilkite skirtuką ir palyginkite.',
    realResults: 'Sukurta su ShotMe',
    compareLabel: 'Vilkite liniją ir palyginkite prieš bei po',
    restoreExamples: ['Išblukęs studijos portretas', 'Mama ir močiutė, 1930-ieji', '1940-ųjų šeimos nuotrauka'],
    howTitle: 'Nuo nuotraukos iki rezultato per tris žingsnius',
    howIntro: 'Nemokamoje versijoje nereikia redaktoriaus, teksto užklausos ar specialių įgūdžių.',
    steps: [
      { title: 'Įkelkite nuotrauką', description: 'Pasirinkite vaizdą telefone arba kompiuteryje.' },
      { title: 'Automatinis atkūrimas', description: 'ShotMe pašalina pažeidimus, atkuria ryškumą ir prideda laikmetį atitinkančias spalvas.' },
      { title: 'Atsisiųskite', description: 'Peržiūrėkite rezultatą ir išsaugokite jį įrenginyje.' },
    ],
    pricingTitle: 'Aiški kaina prieš pradedant',
    pricingIntro: 'Išbandykite dešimt generacijų nemokamai. Mokami paketai yra vienkartiniai pirkiniai, ne prenumerata.',
    freePlanName: 'Nemokamas bandymas',
    freePlanDesc: '10 generacijų be el. pašto ir banko kortelės',
    oneTimePayment: 'Vienkartinis mokėjimas',
    paidFeaturesTitle: 'Mokamuose paketuose taip pat',
    paidFeatures: ['Privati galerija', 'Rankiniai pataisymai', 'Balso pataisymai'],
    privacyTitle: 'Jūsų nuotrauka lieka jūsų',
    privacyIntro: 'Originalas naudojamas užklausai apdoroti ir po jos užbaigimo sąmoningai nesaugomas.',
    privacyPoints: ['Originalus failas neperrašomas', 'Mokamus rezultatus galima saugoti privačioje galerijoje', 'Mokėjimus apdoroja Stripe; ShotMe nesaugo visų kortelės duomenų'],
    faqTitle: 'Klausimai prieš įkeliant',
    faqs: [
      { question: 'Ar originali nuotrauka pasikeis?', answer: 'Ne. ShotMe sukuria atskirą rezultatą, o originalas seanso metu lieka palyginimui.' },
      { question: 'Ar veidas liks toks pats?', answer: 'Modeliui nurodoma išsaugoti tapatybę ir veido bruožus, tačiau labai pažeistoms ar mažoms nuotraukoms AI tikslumo garantuoti negalima.' },
      { question: 'Ar rezultatą galima spausdinti?', answer: 'Taip, tačiau kokybė priklauso nuo pradinės ir sukurtos nuotraukos dydžio bei ryškumo.' },
      { question: 'Ką daryti, jei rezultatas nepatinka?', answer: 'Bandykite dar kartą su aiškesne nuotrauka. Nesėkmingas ar užblokuotas bandymas nenuskaičiuojamas.' },
    ],
    finalRestoreTitle: 'Atgaivinkite svarbią šeimos nuotrauką',
    finalRestoreCta: 'Atkurti mano nuotrauką nemokamai',
    sourcePhoto: 'Pradinė nuotrauka',
    startFree: 'Pradėti nemokamai',
    choosePackage: 'Pasirinkti paketą',
  },
  [Language.FI]: {
    galleryRestoreTitle: 'Aitoja entisöintituloksia',
    galleryIntro: 'ShotMe loi nämä esimerkit lisensoiduista lähdekuvista. Vertaa vetämällä jakajaa.',
    realResults: 'Luotu ShotMellä',
    compareLabel: 'Vertaa ennen ja jälkeen vetämällä viivaa',
    restoreExamples: ['Haalistunut studiomuotokuva', 'Äiti ja isoäiti, 1930-luku', '1940-luvun perhekuva'],
    howTitle: 'Kuvasta tulokseen kolmessa vaiheessa',
    howIntro: 'Ilmaisversiossa et tarvitse editoria, tekstikehotetta tai erityistaitoja.',
    steps: [
      { title: 'Lataa valokuva', description: 'Valitse kuva puhelimesta tai tietokoneelta.' },
      { title: 'Automaattinen entisöinti', description: 'ShotMe korjaa vauriot, palauttaa terävyyden ja lisää aikakauteen sopivat värit.' },
      { title: 'Lataa tulos', description: 'Tarkista valmis kuva ja tallenna se laitteellesi.' },
    ],
    pricingTitle: 'Selkeä hinta ennen aloittamista',
    pricingIntro: 'Kokeile kymmentä generointia ilmaiseksi. Maksulliset paketit ovat kertaostoja, eivät tilauksia.',
    freePlanName: 'Ilmainen kokeilu',
    freePlanDesc: '10 generointia ilman sähköpostia tai pankkikorttia',
    oneTimePayment: 'Kertamaksu',
    paidFeaturesTitle: 'Maksullisiin paketteihin kuuluu myös',
    paidFeatures: ['Yksityinen galleria', 'Manuaaliset korjaukset', 'Äänikorjaukset'],
    privacyTitle: 'Kuvasi pysyy sinun',
    privacyIntro: 'Alkuperäistä käytetään pyynnön käsittelyyn, eikä sitä tarkoituksellisesti säilytetä käsittelyn jälkeen.',
    privacyPoints: ['Alkuperäistä tiedostoa ei korvata', 'Maksulliset tulokset voi tallentaa yksityiseen galleriaan', 'Stripe käsittelee maksut; ShotMe ei tallenna täydellisiä korttitietoja'],
    faqTitle: 'Kysymyksiä ennen lataamista',
    faqs: [
      { question: 'Muuttuuko alkuperäinen kuva?', answer: 'Ei. ShotMe luo erillisen tuloksen ja pitää alkuperäisen vertailtavana istunnon ajan.' },
      { question: 'Säilyvätkö kasvot samoina?', answer: 'Mallia ohjataan säilyttämään henkilöllisyys ja kasvonpiirteet, mutta hyvin vaurioituneen tai pienen kuvan AI-tarkkuutta ei voida taata.' },
      { question: 'Voinko tulostaa tuloksen?', answer: 'Kyllä, mutta tulostuslaatu riippuu lähdekuvan ja luodun tiedoston koosta ja tarkkuudesta.' },
      { question: 'Entä jos en pidä tuloksesta?', answer: 'Yritä uudelleen selkeämmällä lähdekuvalla. Epäonnistunutta tai estettyä käsittelyä ei vähennetä.' },
    ],
    finalRestoreTitle: 'Herätä tärkeä perhekuva uudelleen eloon',
    finalRestoreCta: 'Palauta kuvani ilmaiseksi',
    sourcePhoto: 'Lähdekuva',
    startFree: 'Aloita ilmaiseksi',
    choosePackage: 'Valitse paketti',
  },
};
