//allt som är markerat med "AI KOD " eller "===========" är kommentarer som AI
//har skrivit, som vi anser att vi inte kan förklara bättre själva. Därav har vissa AI kommentarer behållts.
/* ============================================================
   DEL 1: HÄMTA ELEMENTEN FRÅN HTML-SIDAN
    Vi sparar det i en variabel så att vi kan använda det senare.
   const = en variabel som aldrig byter värde efter att den skapats.
   ============================================================ */
const karaktar = document.getElementById("karaktar"); // karaktären som rör på sig
const spelplan = document.getElementById("spelplan"); //lådan karaktären rör sig innnanför "spelplanen"
const startKnapp = document.getElementById("startKnapp"); //knappen "starta mikrofon"
const enhetsLista = document.getElementById("enhetsLista"); //rullistan med mikrofoner, viktig för kontaktmikrofon
const kanslighetSlider = document.getElementById("kanslighet"); //fixar känslighet
const statusText = document.getElementById("status"); //textraden som visar status
const matarFyllning = document.getElementById("matarfyllning");// den gröna volymmätaren åt höger
const gameOver = document.getElementById("gameOver"); //hela gameover popupen
const info = document.getElementById("info"); //hela info-rutan i början
const infoKnapp = document.getElementById("infoKnapp"); //lets go-knappen i info-rutan
const startOmKnapp = document.getElementById("startOmKnapp"); //start over-knappen i gameover-popupen
const infoStatus = document.getElementById("infoStatus");  //textraden i info-rutan som visar vad som händer med mikrofonen
let ws = new WebSocket("ws://10.0.0.100:8080");
let L = (n, v) => ws.readyState == 1 && ws.send(JSON.stringify({ type: 'take', lights: [n], values: v }));
/* ============================================================
   DEL 2: VARIABLER FÖR LJUDET
   Här skapar vi variabler som vi fyller med värden längre ner.
   let = en variabel som KAN byta värde.
   null = "ingenting än", vi fyller i det senare.
   ============================================================ */
//webbläsarens ljudmotor. Allt som har med ljud att göra går via den
let audioContext = null;
//verktyg som kan mäta ljudet, t.ex. hur högt det är
let analyser = null;
//en lista där vi lägger ljudvågen varje gång vi mäter den
let dataArray = null;
//ljudet som kommer in från mikrofonen
let stream = null;
//bakgrundsbruset i rummet som mäts vid kalibrering och drar bort det, "tyst" blir 0
let basniva = 0;
//mjuk version av volymen, annars hoppar det för mycket,
//jämnas ut så att det ej blir hackig och darrig
let jamnadVolym = 0;
//karaktären ligger ej helt nere på botten, 10 pixlar över marken
const markHojd = 10;
/* ============================================================
   DEL 3: FUNKTIONER
   En funktion är en kodbit med ett namn. Vi kan "anropa" den
   (köra den) när vi vill, genom att skriva namnet och ().
   ============================================================ */
/* ===============================================================
   FUNKTION 1: startaMikrofon
   Vad den gör: ber om tillåtelse att använda mikrofonen och
   kopplar ihop mikrofonen med analysatorn som mäter ljudet.
   deviceId = vilken mikrofon som ska användas. Om vi inte skickar
   med något används datorns standardmikrofon.
   "async" och "await" betyder att koden ibland måste vänta,
   till exempel på att användaren trycker "Tillåt" i webbläsaren.
   ================================================================*/
async function startaMikrofon(deviceId) {
    //om en mikrofonen är igång från början stänger vi av den först
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (audioContext) await audioContext.close();
    //try = försök göra detta. om något går fel hoppar koden till "catch"
    try {
        //be webbläsaren om mikrofonen -> ruta dyker upp och frågar användaren om "tillåt", 
        //om användaren "blockerar" hoppar den till "Catch"
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                //här frågas vilken mikrofon som ska användas. 
                //"exact" betyder just den vi valde.
                //om vi inte valt någon (undefined) används standardmikrofonen
                deviceId: deviceId ? { exact: deviceId } : undefined,
                //webbläsaren kommer att försöka fixa ljudet automatiskt
                //funkar ej bra för kontaktmikrofonen, ändrar signalen
                //därför stänger vi av alla tre:
                echoCancellation: false, //tar bort eko
                noiseSuppression: false, //tar bort bakgrundsljud
                autoGainControl: false //fixar volymen automatiskt
            }
        });

    } catch (fel) {
        //om något går fel, t.ex. användare klickar "blockera"
        //eller att ingen mikrofon finns, visar felmeddelande i statusraden och stoppar funktionen
        statusText.textContent = "Kunde inte öppna mikrofonen: " + fel.message;
        infoStatus.textContent = "Kunde inte öppna mikrofonen: " + fel.message;   //KOLLA IGENOM
        return false;   //false betyder "det gick inte"
    }
    //skapa ljudmotorn
    audioContext = new AudioContext();

    //gör om mikrofonströmmen till en "ljudkälla" som motorn kan använda, som kan hämta upp och använda ljudet från mikrofonen.
    //==Det är som att sätta en kontakt på en sladd så att den passar i uttaget. Nu kan du koppla ihop mikrofonen med andra verktyg.==
    const kalla = audioContext.createMediaStreamSource(stream);

    //skapa analysatorn som kan mäta ljudet (mätninginstrument) , den är alltså verktyget som mäter ljudet.
    analyser = audioContext.createAnalyser();

    //fftsize och analysatorn läser hur många ljudprover vi läser åt gången och ger de olika värden
    // Ett litet tal (1024) gör att bollen reagerar snabbt. ==
    //hur snabbt bollen reagerar på ljudet.
    analyser.fftSize = 1024;

    //gör analysatorn lite mjukare mellan mätningarna (0 till 1).
    analyser.smoothingTimeConstant = 0.1;

    //koppla samman mikrofon till analysator
    //nu "lyssnar" analysatorn på mikrofonen
    kalla.connect(analyser);

    // här skapas listan där ljudvågen ska ligga. Den ska vara lika lång som fftSize.
    //namnet på listan-- skapa en ny lista med decimaltal längden på listan är 1024 platser lång
    dataArray = new Float32Array(analyser.fftSize);

    //visas i statusraden att vi "Lyssnar..." på ljudet, micken är alltså på
    statusText.textContent = "Lyssnar...";

    //rulllistan med mikrofonernas olika namn visas
    //de visas ändast när användaren har gett tillåtelse 
    // att använda mikrofonen, annars hämtas inte listan på mikrofoner
    await fyllEnhetslista();

    //mäter bakgrundsbruset direkt
    //await gör att vi väntar tills kalibreringen är klar innan funktionen är färdig
    infoStatus.textContent = "Kalibrerar, var tysta...";
    await kalibrera();

    return true; //true betyder "det gick bra"
}
/* ===============================================================
   FUNKTION 2: fyllEnhetslista
   Vad den gör: hittar alla mikrofoner som är anslutna och lägger
   dem i rullistan, så att man kan välja kontaktmikrofonen.
 ==================================================================*/

async function fyllEnhetslista() {

    //webbläsaren ber om lista på alla "media" enheter, dvs mikrofoner, högtalare, kamera.
    const enheter = await navigator.mediaDevices.enumerateDevices();

    //==vill bara använda oss av mikrofoner, "audioinput" innebär ljudingång.
    //filter() behåller bara de enheter där vilkoren stämmer översens.
    // "e" är en enhet, "e.kind" är vilken typ av enhet det är==
    //ger listan med mikrofoner 
    const mikrofoner = enheter.filter(e => e.kind === "audioinput");

    //denna funktion kommer ihåg vilken mikrofon som var vald, så att vi kan välja om igen och utgå från den 
    //vid nästa gång vi startar mikrofonen
    const valt = enhetsLista.value;

    //töm rullistan innan vi fyller på den, annars blir det dubbletter
    enhetsLista.innerHTML = "";

    //gå igenom alla mikrofoner (m) en o en, och lägg till dem i rullistan 
    //(i) är siffran på mikrofonen i listan, dvs 0, 1, 2 osv.
    mikrofoner.forEach((m, i) => {

        //skapar ett nytt alternativ i rullistan
        const alt = document.createElement("option");

        //value är mikrofonens värde, som vi skickar med när vi startar mikrofonen,
        //"deviceId" är ett unikt id för varje mikrofon
        alt.value = m.deviceId;

        //texten som användaren ser 
        // om mikrofonen saknar namn kallar vi den
        // "Mikrofon 1", "Mikrofon 2" osv.
        alt.textContent = m.label || "Mikrofon " + (i + 1);

        //lägger till alternativet i rullistan
        enhetsLista.appendChild(alt);
    });

    //om något var valt tidigare, välj det igen
    if (valt) enhetsLista.value = valt;
}


//hamtaVolym
//enligt AI så räknas det ut hur hög volymen är just nu och
//skickar tillbaka ett tal. talen är 0, som då ska motsvara helt tyst, medan 1 ska vara högsta volym. och under tiden ska den 
//räkna ut ett medelvärde*/
function hamtaVolym() {

    // Läs av ljudvågen just nu. Resultatet läggs i dataArray som en lång
    // lista med tal mellan -1 och 1.

    analyser.getFloatTimeDomainData(dataArray);
    //AI KOD KOMMER NEDAN!  Vi förstår ungefär denna del, men principen är att få fram kvadratroten och tillsätta det 
    // i loopen som kommer nedan?
    // Här räknar vi ut volymen med en metod som heter RMS:
    //   1) Kvadrera varje tal (så att minus blir plus)
    //   2) Räkna ut medelvärdet av alla
    //   3) Ta kvadratroten ur resultatet

    let summa = 0; //här läggs då alla kvadrerade tal ihop
    //här är en loop, den går igenom listan från första talet som då är 0 till sista

    for (let i = 0; i < dataArray.length; i++) {
        summa += dataArray[i] * dataArray[i];   // AI KOD tal * tal = kvadrat, läggs till i summan
    }

    //dela med antalet tal (= medelvärde) och ta roten ur. vi försöker lära oss mer om "matte" delen av ljudet just nu. 
    //uppdatering, nu förstår vi meningen, vilket grundar sig på att ljudvågorna går  
    //ständigt upp och ned, mellan – och +. dessa siffor kan ta ut varandra och bli 0, vilket inte stämmer med ljudvågorna. Därför måste man kvadrera. Metoden heter rms 
    //AI KOD "return" skickar tillbaka svaret till den som anropade funktionen. 
    return Math.sqrt(summa / dataArray.length);
}
function kalibrera() {

    //nedan betyder det att om mikrofonen inte är på eller kopplad så avbryts det med en if sats 
    if (!analyser) return Promise.resolve();

    statusText.textContent = "Kalibrerar, var tysta...";

    // promise klar menas med ett “löfte! som klar uppfyller när kalibreringen är färdig. 
    // await i startamikrofon kan vänta på den. 
    return new Promise(klar => {
        let summa = 0; //summan av alla mätningar 
        let antal = 0; //hur många mätningar som vi har gjort 

        //notera vilken tid vi startade i millisekunder. 
        const start = performance.now();

        // AI KOD! setInterval kör koden i { } om och om igen, var 20:e millisekund.  
        const timer = setInterval(() => {

            // här försökte vi med kod koppla lampan, men det gick inte. Vi fick tyvärr köra med ljud från webben. 
            L('Wash 35', {
                dimmer: 255,
                hue: Math.random() * 360, // slumpa färgen på lampan 
                sat: 255,
                delay: 1000
            });

            console.log("Blinkar");
            summa += hamtaVolym(); //här mäts volymen (igen?) och läggs till i summan 
            antal++; //räknar upp antalet mätningar med 1, alltså inte lägre än det 

            // AI KOD Har det gått mer än 1000 ms (1 sekund) sedan vi startade? 
            if (performance.now() - start > 1000) {
                clearInterval(timer); // AI KOD sluta upprepa 
                basniva = summa / antal; // AI KOD medelvärdet är bakgrundsbruset 
                statusText.textContent = "Klart! Gör ljud!";
                klar(); // NYTT: berättar att kalibreringen är klar 
            }
        }, 20);
    });
}
//variabler för banan
const bana = document.getElementById("bana"); //den höga lådan som glider ner 
const banLangd = 6000; //banans längd i pixlar (samma som height i CSS) 
const framatFart = 6; //hur många pixlar karaktären går framåt per bildruta, oavsett ljud 
let framat = 0; //hur långt karaktären gått framåt i banan (0 = start) 

let spelIgang = false; //blir true när man tryckt på Starta mikrofon 
let klarat = false; // true när man nått målet 

// ===== NYTT: DANSGOLVET ===== 
const golv = document.getElementById("golv"); //lådan som rutorna ska läggas i 
const kolumner = 8; //antal rutor på bredden (samma som repeat(8, 1fr) i CSS) 
const radHojd = 100; //hur hög varje rad är i pixlar (samma som grid-auto-rows i CSS) 
const rader = banLangd / radHojd; //antal rader: 6000 / 100 = 60 


//färger till rutorna
//"morka" är de mörka grundfärgerna 
//"neon" är färgerna som rutorna blinkar till.
const morkaFarger = ["#0b0720", "#120a35", "#1a0f4d", "#2a1070"];
const neonFarger = ["#19e6ff", "#19e6ff", "#2f7bff", "#8a3dff", "#8a3dff", "#c026d3", "#ff3fb4"];

//en funktion som väljer en slumpmässig färg ur en lista 
//==math random ger ett tal mellan 0 och 1 medan mathfloor “avrundar nedåt” till ett heltal.== 
function slumpaFarg(lista) {
    return lista[Math.floor(Math.random() * lista.length)];
}
// skapa en ruta för varje plats i rutnätet: kolumner * rader = 480 rutor 
for (let i = 0; i < kolumner * rader; i++) {

    const ruta = document.createElement("div"); //skapar en ny tom ruta 
    ruta.className = "ruta"; // ger den utseendet från .ruta i CSS 
    const mork = slumpaFarg(morkaFarger); // en mörk färg till varje ruta 

    // Är slumptalet under 0.7 (ca 7 av 10 rutor) så blinkar rutan, annars är den bara mörk. 
    if (Math.random() < 0.7) {
        ruta.className = "ruta blinkar"; //lägger till klassen som sätter igång blinkandet 
        ruta.style.setProperty("--fran", mork); //färgen den börjar och slutar på 
        ruta.style.setProperty("--till", slumpaFarg(neonFarger)); //neonfärgen den tonas upp till 

        //hur lång tid ett blink tar: slumpas mellan 3 och 7 sekunder (långsamt) 
        ruta.style.animationDuration = (3 + Math.random() * 4) + "s";
        //minus framför gör att rutan startar mitt i sitt blink istället för i början, 
        //annars skulle alla rutor blinka exakt samtidigt 
        ruta.style.animationDelay = (-Math.random() * 7) + "s";
    } else {
        ruta.style.background = mork; //de som inte blinkar får bara den mörka färgen 
    }
    golv.appendChild(ruta); //lägger in rutan i dansgolvet 
}
// ===== NYTT: BARERNA ===== 
// De flesta delarna av baren (disk, stolar, flaskor) görs med bara CSS. 
// Här lägger vi bara in de lysande BAR-skyltarna på bakhyllan, på båda sidor. 
// Siffrorna är hur långt fram i banan (i pixlar) varje skylt sitter. Ändra eller lägg till fler. 
const skyltPlatser = [600, 2100, 3600, 5100];

// querySelectorAll hittar ALLA element med klassen "hylla" (en på varje bar) 
document.querySelectorAll(".hylla").forEach(hylla => {
    skyltPlatser.forEach(y => {
        const skylt = document.createElement("div"); // skapar en ny tom ruta 
        skylt.className = "skylt"; // utseendet kommer från .skylt i CSS 
        skylt.textContent = "BAR"; // texten som visas 
        skylt.style.bottom = y + "px"; // hur långt fram i banan skylten sitter 
        hylla.appendChild(skylt); // lägger in den i hyllan 
    });
});

// ===== NYTT: HINDER ===== 
//"framat" är hur långt in i banan hindret ligger (px från start, banan är 6000 lång) 
//och "x" är var i sidled det ligger: 0 = längst till vänster, 1 = längst till höger. 
//Flera hinder med SAMMA framat men olika x kommer samtidigt bredvid varandra. 
const hinderData = [
    { framat: 600, x: 0.25 },
    { framat: 1000, x: 0.70 },
    { framat: 1400, x: 0.15 }, //två samtidigt 
    { framat: 1400, x: 0.60 },
    { framat: 1800, x: 0.85 },
    { framat: 2100, x: 0.35 },
    // tre samtidigt 
    { framat: 2500, x: 0.50 },
    { framat: 2500, x: 0.90 },
    { framat: 2900, x: 0.60 },
    { framat: 3200, x: 0.20 },
    { framat: 3500, x: 0.30 }, //två samtidigt 
    { framat: 3500, x: 0.80 },
    { framat: 3900, x: 0.50 },
    { framat: 4200, x: 0.10 }, //två samtidigt 
    { framat: 4200, x: 0.55 },
    { framat: 4900, x: 0.25 },
    { framat: 5200, x: 0.45 }
];

//"hit" är träffytan: 1 = hela bildrutan, 0.5 = hälften. Smala eller små bilder ska ha lägre tal. 
const hinderBilder = [
    { bild: "images/ditt_ex.png", hit: 0.8 },
    { bild: "images/watch_out_png.png", hit: 0.8 },
    { bild: "images/flaska.png", hit: 0.4 },
    { bild: "images/ful_grabb.png", hit: 0.8 },
    { bild: "images/spilld_drink.png", hit: 0.8 }
];
//en lista där vi sparar alla hinder, så att vi kan kolla krock med dem senare 
const hinder = [];

//gå igenom hinderData och skapa en ruta (en <div>) för varje rad 
hinderData.forEach((h, i) => {
    const val = hinderBilder[i % hinderBilder.length]; //bilderna pendlar: 0,1,2,3,4,0,1... 
    const cirkel = document.createElement("div");
    cirkel.className = "hinder";
    cirkel.style.backgroundImage = 'url("' + val.bild + '")';
    cirkel.hit = val.hit; //sparar träffytan på hindret 
    cirkel.style.bottom = h.framat + "px"; //hur långt fram i banan 
    cirkel.style.left = (h.x * 100) + "%"; //hur långt åt höger, i procent av bredden 
    bana.appendChild(cirkel); //lägger in det i banan, så att det glider med 
    hinder.push(cirkel); //sparar det i listan 
});

//kollar om karaktären nuddar någon cirkel 
function kollaKrock() {

    //getBoundingClientRect() ger var på skärmen en ruta finns just nu (left, top, width, height) 
    const k = karaktar.getBoundingClientRect();

    //karaktärens mittpunkt. Vi räknar karaktären som en cirkel, lite mindre än rutan (80%) 
    //så att det inte känns orättvist när man bara precis nuddar hörnet av bilden. 
    const kx = k.left + k.width / 2;
    const ky = k.top + k.height / 2;
    const kRadie = (k.width / 2) * 0.4;

    for (const cirkel of hinder) {
        const r = cirkel.getBoundingClientRect();
        const hx = r.left + r.width / 2; //cirkelns mittpunkt i sidled 
        const hy = r.top + r.height / 2; //cirkelns mittpunkt i höjdled 

        //=Math.hypot = avståndet mellan två punkter (Pythagoras sats) =
        const avstand = Math.hypot(kx - hx, ky - hy);

        //=om avståndet mellan mittpunkterna är mindre än radierna ihop så nuddar cirklarna varandra ==
        if (avstand < kRadie + (r.width / 2) * cirkel.hit) {
            forlorat();
            return; // vi behöver inte kolla fler cirklar 
        }
    }
}
//körs när man krockat: spelet stannar och GAME OVER-popupen visas 
function forlorat() {
    spelIgang = false; //stoppar framåtrörelsen (och krockkollen) direkt 
    statusText.textContent = "Du krockade!";
    gameOver.classList.add("visas"); // visar popupen (CSS-klassen "visas" gör den synlig) 
}
//loop som körs om och om igen, flera ggr i sekunden. den ska alltså räkna ut höjden och flytta bollen dit baserat på ljudet. 
//samma sak sker alltså om och om igen väldigt snabbt 
function loop() {
    //här ber vi webbläsaren köra loop igen i nästa bildruta. 
    //på så sätt så vi får en oändlig loop som uppdateras ca 60 ggr i sekunden 
    requestAnimationFrame(loop);
    //funktionen FRAMÅT sker ALLTID och beror inte på ljudet
    //slut tar det när karaktärens topp når målet längst fram i banan,målet är 20px högt
    const slut = banLangd - 20 - karaktar.offsetHeight - markHojd;
    if (spelIgang && !klarat) {
        framat += framatFart;
        if (framat >= slut) {
            framat = slut;
            klarat = true;
            statusText.textContent = "Du klarade banan! Klicka Starta mikrofon för att köra igen.";
        }
    }
    //kamera menas att banan glider ner över skärmen så att karaktären ser ut att gå framåt. 
    //När banans slut syns slutar banan glida och karaktären går i stället uppåt på skärmen, 
    //så att den kan gå hela vägen fram till målet. 
    const kamera = Math.min(framat, banLangd - spelplan.clientHeight);
    bana.style.transform = "translateY(" + kamera + "px)";
    karaktar.style.bottom = (markHojd + (framat - kamera)) + "px";


    //kolla om karaktären nuddar en cirkel bara medan spelet är igång) ==
    if (spelIgang && !klarat) kollaKrock();
    //Om mikrofonen inte är startad än finns inget att göra med ljudet. "Avbryt."" 
    if (!analyser) return;
    //hämta volymen och dra bort bakgrundsbruset 
    // AI KOD Math.max(0, ...) ser till att resultatet aldrig blir mindre än 0. 
    //som sagt, dessa matte koder måste vi förstå lite bättre.. 


    let volym = Math.max(0, hamtaVolym() - basniva);
    //förstärk med känslighetsreglaget, denna funktion styr hur känsligt ljudet tas upp och påverkar utslaget/responsen 
    //reglaget ger ett tal mellan 1 och 100. detta ska multipliceras med 0.5. 
    //ett högt tal betyder att även svaga ljud ger stort utslag, händer om man drar reglaget längre upp. 


    const forstarkning = kanslighetSlider.value * 0.5;
    // AI KOD, Multiplicera volymen med förstärkningen. 
    // Math.min(1, ...) ser till att den aldrig blir större än 1. 


    volym = Math.min(1, volym * forstarkning);
    //koden nedan ska jämna ut rörelsen, annars hoppas bollen hackigt 
    //"jamnadVolym" rör sig mot den riktiga volymen men lite i taget, istället för direkt 
    //Stiger ljudet med hög hastighet som nedan har värdet 0,4, så hoppar bollen snabbt upp 
    //Sjunker ljudet med låg hastighet, värde 0,08, så sjunker bollen långsamt ned 
    //vi kan ändra värdena som vi vill, vilket vi nog kommer göra då den skjuts upp väldigt snabbt i nuläget. 


    const hastighet = volym > jamnadVolym ? 0.09 : 0.08;
    jamnadVolym += (volym - jamnadVolym) * hastighet;
    //först räknas det ut hur långt åt höger bollen kan komma 
    //ÄNDRAT: förut räknade vi ut höjden (maxHojd), nu räknar vi ut bredden. 
    //AI KOD spelplanens bredd minus bollens bredd. 
    //ÄNDRAT: nu räknar vi bredden på dansgolvet (banan) istället för på hela spelplanen. 


    const maxBredd = bana.clientWidth - karaktar.offsetWidth;
    // ==AI KOD jamnadVolym är ett tal mellan 0 och 1: 
    // 0 = längst till vänster (tyst) 
    // 0.5 = mitt på banan 
    // 1 = längst till höger (högt ljud) 
    // Vi multiplicerar med maxBredd och får positionen i pixlar. 
    // ÄNDRAT: bana.offsetLeft är banans avstånd från skärmens vänsterkant (5 cm), så att karaktären stannar på dansgolvet.== 


    karaktar.style.left = (bana.offsetLeft + jamnadVolym * maxBredd) + "px";
    // == STEG 5: Uppdatera volymmätaren ==
    // Den gröna stapeln blir högre ju högre ljud (0% till 100%). 
    matarFyllning.style.height = (jamnadVolym * 100) + "%";
}

//här ska knapparna kopplas till funktionerna 
//addEventListener betyder att man lyssnar efter en händelse. 
//när man klickar på Starta mikrofon, så körs koden startaMikrofon. 
//här startas även framåtrörelsen och nollställer banan så att man börjar om från start
startKnapp.addEventListener("click", () => {
    gameOver.classList.remove("visas");
    framat = 0;
    klarat = false;
    spelIgang = true;
    startaMikrofon();
});
//samma sak, när man väljer en annan mikrofon i listan, så startas mikrofonen om, med den nya valda mikrofonen 
enhetsLista.addEventListener("change", () => startaMikrofon(enhetsLista.value));

//när man klickar START OVER göms popupen och spelet börjar om från start. 
//mikrofonen startas inte om, den är redan igång. 
startOmKnapp.addEventListener("click", () => {
    gameOver.classList.remove("visas");
    framat = 0; // tillbaka till start 
    klarat = false;
    spelIgang = true; // framåtrörelsen sätter igång igen 
    statusText.textContent = "Lyssnar...";
});

//starta spelet, denna funktion körs direkt där sidan laddas 
//detta placerar bollen nere vid marken från början. 
karaktar.style.bottom = markHojd + "px";

//Denna funktion placerar karaktären längst till vänster på dansgolvet från början, det är alltså default position 
karaktar.style.left = bana.offsetLeft + "px";

//starta spelloopen. Den väntar på mikrofonen och börjar sedan 
//flyttas bollen så fort ljudet kommer in. 
infoKnapp.addEventListener("click", () => {
    info.classList.add("doljs"); //döljer inforutan 
    framat = 0; //tillbaka till start 
    klarat = false;
    spelIgang = true;
    startaMikrofon();
});
loop();
