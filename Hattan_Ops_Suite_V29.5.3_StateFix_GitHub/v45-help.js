/* V45 — Team Member Help Guide
   • "❓ Help" button in the top bar (and F1 key) on every screen, plus "Help" in the sidebar.
   • Type what you want to do ("how do I pick up", "cobrar tarjeta") → simple step-by-step guide.
   • Every step has a picture: a little map of the screen showing WHERE, and a copy of the button to press.
   • "Show me" lights up the real button on the real screen, one step at a time.
   • "Read to me" reads the steps out loud. English / Español.
   Works offline — no internet or AI needed. */
(function () {
  'use strict';
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = (p) => `.pos-nav button[onclick="posGoTo('${p}')"]`;
  const OC = (prefix) => `[onclick^="${prefix}"]`;

  /* ------------------------------------------------------------------
     STEP FORMAT:  [where, selector, [english, español], [pictures]]
     where:   side = left menu · top = top bar · main = middle of screen
              right = right panel on Counter · pop = pop-up box · key = keyboard · scan = scanner
     picture: 'nav:Text' menu button · 'b:Text' green button · 'w:Text' white button
              'i:Text' typing box · 'k:+' keyboard key · 'c:Text' small option · 'y:Text' yellow button
     ------------------------------------------------------------------ */
  const CATS = [
    ['learn', '🎓', 'Training videos (dry cleaning know-how)', 'Videos de entrenamiento'],
    ['start', '🚪', 'Getting started', 'Para empezar'],
    ['drop', '🧥', 'Drop off (new ticket)', 'Dejar ropa (ticket nuevo)'],
    ['pick', '🛍️', 'Pick up & payment', 'Recoger y pagar'],
    ['rack', '🏷️', 'Tags, rack & printing', 'Etiquetas, rack e imprimir'],
    ['card', '💳', 'Cards & text messages', 'Tarjetas y mensajes'],
    ['tailor', '✂️', 'Tailor', 'Sastre'],
    ['deliv', '🚚', 'Delivery', 'Entregas'],
    ['fix', '🛟', 'Something is wrong', 'Algo no funciona']
  ];

  const TOPICS = [
    /* ---------------- GETTING STARTED ---------------- */
    { id: 'signin', cat: 'start', ic: '🔑', t: ['Sign in to the register', 'Entrar a la caja'],
      k: 'sign in login log on start pin password register open enter entrar iniciar sesion clave contrasena',
      s: [
        ['main', OC('posSelectStaff('), ['Find your name on the screen and tap it.', 'Busca tu nombre en la pantalla y tócalo.'], ['w:MR  Matt']],
        ['pop', null, ['Type your PIN number (your secret code). Press Enter.', 'Escribe tu PIN (tu código secreto). Presiona Enter.'], ['i:• • • •', 'k:Enter']],
        ['main', null, ['You are in! You will see the Counter screen.', '¡Listo! Verás la pantalla del Mostrador (Counter).'], ['nav:Counter']],
        ['side', OC('posSignOut'), ['When you leave, tap "Sign Out Register" at the bottom of the left menu.', 'Cuando te vayas, toca "Sign Out Register" abajo en el menú de la izquierda.'], ['w:Sign Out Register']]
      ] },
    { id: 'clock', cat: 'start', ic: '⏰', t: ['Clock in / clock out (punch clock)', 'Marcar entrada / salida (reloj)'],
      k: 'clock in out punch time card timesheet hours shift break lunch start work reloj marcar entrada salida horas turno',
      s: [
        ['main', OC('v12OpenPunchClock'), ['On the sign-in screen, tap "Employee Punch Clock".', 'En la pantalla de entrada, toca "Employee Punch Clock".'], ['w:Employee Punch Clock']],
        ['pop', null, ['Tap your name and type your PIN.', 'Toca tu nombre y escribe tu PIN.'], ['i:• • • •']],
        ['pop', null, ['Tap "Clock In" when you start. Tap "Clock Out" when you go home.', 'Toca "Clock In" al empezar. Toca "Clock Out" al irte a casa.'], ['b:Clock In', 'w:Clock Out']],
        ['side', N('team'), ['Managers can see everyone\'s hours in the "Team" menu.', 'Los gerentes ven las horas de todos en el menú "Team".'], ['nav:Team']]
      ] },
    { id: 'find', cat: 'start', ic: '🔎', t: ['Find a customer', 'Buscar un cliente'],
      k: 'find search look customer client name phone number lookup who account profile buscar cliente nombre telefono cuenta',
      s: [
        ['side', N('counter'), ['Tap "Counter" in the left menu.', 'Toca "Counter" en el menú de la izquierda.'], ['nav:Counter']],
        ['main', 'input[placeholder^="Name / phone / address"]', ['Tap the big white box. Type the customer\'s name OR phone number OR apartment.', 'Toca el cuadro blanco grande. Escribe el nombre O el teléfono O el apartamento del cliente.'], ['i:Name / phone / address / customer #']],
        ['main', '.v282-result', ['Names show up under the box. Tap the right customer.', 'Aparecen nombres debajo. Toca el cliente correcto.'], ['w:Zoe Quinn · 212-555-0142']],
        ['main', OC('v287Dropoff('), ['Now pick what you are doing: Pick Up, Drop Off, or View Customer Profile.', 'Ahora elige: Pick Up (recoger), Drop Off (dejar) o View Customer Profile (ver perfil).'], ['b:Pick Up', 'b:Drop Off', 'w:View Customer Profile']]
      ] },
    { id: 'newcust', cat: 'start', ic: '➕', t: ['Add a new customer', 'Agregar un cliente nuevo'],
      k: 'new customer add create first time sign up register client nuevo cliente agregar crear primera vez',
      s: [
        ['side', N('customers'), ['Tap "Customers" in the left menu.', 'Toca "Customers" en el menú de la izquierda.'], ['nav:Customers']],
        ['main', OC('posOpenNewCustomer'), ['Tap "+ New Customer".', 'Toca "+ New Customer".'], ['b:+ New Customer']],
        ['pop', null, ['Type their name and cell phone. Add the address if they want delivery.', 'Escribe su nombre y celular. Agrega la dirección si quieren entrega.'], ['i:Name', 'i:Phone']],
        ['pop', null, ['Tap Save. Now you can find them on the Counter.', 'Toca Save (guardar). Ya lo puedes buscar en el Counter.'], ['b:Save']]
      ] },
    { id: 'textyes', cat: 'start', ic: '💬', t: ['Ask if we can text the customer (YES / No thanks)', 'Preguntar si podemos mandar mensajes (YES / No thanks)'],
      k: 'text sms consent permission yes no thanks opt in yellow message phone ready text allow permiso mensaje texto si amarillo',
      s: [
        ['main', null, ['When you open a customer, you may see a yellow box asking about texts.', 'Al abrir un cliente puede salir un cuadro amarillo sobre mensajes.'], ['y:Customer said YES', 'w:No thanks']],
        ['main', null, ['ASK the customer out loud: "Can we text you when your order is ready?"', 'PREGÚNTALE al cliente: "¿Le podemos mandar un mensaje cuando su ropa esté lista?"'], []],
        ['main', OC('v34Consent('), ['Only if they say YES, tap "Customer said YES". If they say no, tap "No thanks".', 'Solo si dicen SÍ, toca "Customer said YES". Si dicen no, toca "No thanks".'], ['y:Customer said YES', 'w:No thanks']],
        ['main', null, ['Never press YES without asking. It is the law.', 'Nunca toques YES sin preguntar. Es la ley.'], []]
      ] },
    { id: 'mode', cat: 'start', ic: '🌐', t: ['Change language or Simple mode', 'Cambiar idioma o modo Simple'],
      k: 'language spanish english espanol idioma ingles simple full mode easy big chinese 中文 cambiar',
      s: [
        ['side', OC('v13SetLanguage('), ['At the bottom of the left menu, tap EN for English or ES for Spanish.', 'Abajo en el menú de la izquierda, toca EN para inglés o ES para español.'], ['w:EN', 'w:ES']],
        ['side', OC('v13SetSimpleMode'), ['Tap "Simple" for a cleaner screen with fewer buttons. Tap "Full" to go back.', 'Toca "Simple" para una pantalla con menos botones. Toca "Full" para volver.'], ['w:Full', 'w:Simple']],
        ['main', OC('v282Lang('), ['On the drop-off screen, EN / ES / 中文 changes the ticket buttons only.', 'En la pantalla de dejar ropa, EN / ES / 中文 cambia solo los botones del ticket.'], ['w:EN', 'w:ES', 'w:中文']]
      ] },

    /* ---------------- DROP OFF ---------------- */
    { id: 'dropdry', cat: 'drop', ic: '👔', t: ['Drop off dry cleaning (make a ticket)', 'Dejar ropa para lavado en seco (hacer ticket)'],
      k: 'drop off dropoff dry clean cleaning new ticket order ring up intake garment pants shirt suit dress coat check in dejar ropa lavado seco ticket nuevo orden pantalon camisa traje vestido abrigo',
      s: [
        ['side', N('counter'), ['Tap "Counter" in the left menu.', 'Toca "Counter" en el menú de la izquierda.'], ['nav:Counter']],
        ['main', 'input[placeholder^="Name / phone / address"]', ['Type the customer\'s name or phone number.', 'Escribe el nombre o teléfono del cliente.'], ['i:Name / phone / address / customer #']],
        ['main', '.v282-result', ['Names show up under the box. Tap the right customer.', 'Aparecen nombres debajo. Toca el cliente correcto.'], ['w:Zoe Quinn · 212-555-0142']],
        ['main', OC('v287Dropoff('), ['Tap "Drop Off".', 'Toca "Drop Off".'], ['b:Drop Off']],
        ['main', OC("v282Service('dryclean'"), ['Tap "Dry Cleaning".', 'Toca "Dry Cleaning".'], ['b:Dry Cleaning']],
        ['main', OC('v282Garment('), ['Tap the kind of clothing. Example: Pants, Blouse, Suit.', 'Toca el tipo de ropa. Ejemplo: Pants (pantalón), Blouse (blusa), Suit (traje).'], ['w:Pants / Trousers $12.95', 'w:Blouse $13.95']],
        ['main', OC('v282Qty('), ['How many of that piece? Tap the number.', '¿Cuántas piezas iguales? Toca el número.'], ['w:1', 'w:2', 'w:3']],
        ['main', OC('v282Color('), ['Tap the color. If there are 2 pieces it asks 2 times — one for each.', 'Toca el color. Si son 2 piezas te pregunta 2 veces, una por cada pieza.'], ['c:White', 'c:Black', 'c:Navy']],
        ['main', OC('v282DryMaterial('), ['Pick the fabric if it is special (Wool, Silk, Cashmere). Tap any special directions (Crease, Stain…).', 'Elige la tela si es especial (Wool lana, Silk seda, Cashmere). Toca indicaciones especiales (Crease raya, Stain mancha…).'], ['c:Wool +$1.25', 'c:Silk', 'c:Crease', 'c:Stain']],
        ['main', OC('v282DryNext'), ['Tap "Next →". Nothing special? Tap "Skip — No Special Options".', 'Toca "Next →". ¿Nada especial? Toca "Skip — No Special Options".'], ['b:Next →', 'w:Skip — No Special Options']],
        ['main', null, ['More clothes? Tap the next kind of clothing and do it again.', '¿Más ropa? Toca el siguiente tipo de ropa y repite.'], ['w:Dress', 'w:Coat']],
        ['right', OC('v282SetFulfill('), ['On the right side, check: "Customer Pickup" (they come back) or "Delivery" (we bring it).', 'A la derecha, revisa: "Customer Pickup" (vienen a buscarla) o "Delivery" (se la llevamos).'], ['b:✔ Customer Pickup', 'w:Delivery']],
        ['right', '.v282-complete', ['Tap "Complete & Print". The ticket prints. Give the customer their copy.', 'Toca "Complete & Print". Se imprime el ticket. Dale su copia al cliente.'], ['b:Complete & Print 1 Ticket']]
      ] },
    { id: 'dropshirts', cat: 'drop', ic: '👕', t: ['Drop off laundered shirts', 'Dejar camisas para lavar'],
      k: 'shirts shirt laundry launder laundered starch hanger box boxed folded camisas camisa almidon gancho caja doblada',
      s: [
        ['main', OC('v287Dropoff('), ['Find the customer, then tap "Drop Off".', 'Busca al cliente y toca "Drop Off".'], ['b:Drop Off']],
        ['main', OC("v282Service('shirts'"), ['Tap "Laundered Shirts".', 'Toca "Laundered Shirts".'], ['b:Laundered Shirts']],
        ['main', null, ['Tap how many shirts, then choose: On Hanger or Boxed, and how much starch (None, Light, Medium, Heavy).', 'Toca cuántas camisas y elige: On Hanger (gancho) o Boxed (caja), y almidón (None, Light, Medium, Heavy).'], ['c:On Hanger', 'c:Boxed', 'c:Light', 'c:Heavy']],
        ['right', '.v282-complete', ['Check the right side, then tap "Complete & Print".', 'Revisa el lado derecho y toca "Complete & Print".'], ['b:Complete & Print']]
      ] },
    { id: 'dropwash', cat: 'drop', ic: '🧺', t: ['Drop off wash & fold (by the pound)', 'Dejar ropa para lavar y doblar (por libra)'],
      k: 'wash fold washfold pound pounds lbs weigh weight scale bag laundry lavar doblar libra libras peso bolsa',
      s: [
        ['main', OC('v287Dropoff('), ['Find the customer, then tap "Drop Off".', 'Busca al cliente y toca "Drop Off".'], ['b:Drop Off']],
        ['main', OC("v282Service('washfold'"), ['Tap "Wash & Fold".', 'Toca "Wash & Fold".'], ['b:Wash & Fold']],
        ['main', null, ['Put the bag on the scale. Type the pounds in the box. Tap "Add".', 'Pon la bolsa en la pesa. Escribe las libras en el cuadro. Toca "Add".'], ['i:Enter pounds', 'b:Add']],
        ['right', '.v282-complete', ['Tap "Complete & Print".', 'Toca "Complete & Print".'], ['b:Complete & Print']]
      ] },
    { id: 'dropalt', cat: 'drop', ic: '🪡', t: ['Drop off alterations (hem, take in, zipper)', 'Dejar arreglos (basta, ajustar, cierre)'],
      k: 'alteration alterations alter tailor hem hemming shorten take in let out zipper sleeves waist button repair fix sew arreglo arreglos basta subir ajustar cierre zipper manga cintura boton coser',
      s: [
        ['main', OC('v287Dropoff('), ['Find the customer, then tap "Drop Off".', 'Busca al cliente y toca "Drop Off".'], ['b:Drop Off']],
        ['main', OC("v282Service('alterations'"), ['Tap "Alterations".', 'Toca "Alterations".'], ['b:Alterations']],
        ['main', null, ['Tap the job (example: Pants · Hem). Pick how many and the color.', 'Toca el trabajo (ejemplo: Pants · Hem). Elige cuántos y el color.'], ['w:Pants · Hem', 'w:Jacket · Sleeves']],
        ['right', null, ['Look at the due date on the right. The system picks a day the tailor has time. You can change it.', 'Mira la fecha a la derecha. El sistema elige un día que el sastre tiene tiempo. La puedes cambiar.'], ['w:Due Fri Nov 6']],
        ['right', '.v282-complete', ['Tap "Complete & Print". If the tailor is too busy that day, a box will tell you the next free day.', 'Toca "Complete & Print". Si el sastre está muy ocupado ese día, te dirá el próximo día libre.'], ['b:Complete & Print']]
      ] },
    { id: 'dryalt', cat: 'drop', ic: '✂️', t: ['Dry clean AND alter the same piece', 'Lavar en seco Y arreglar la misma pieza'],
      k: 'dry clean plus alteration both clean and hem clean and alter same garment combo lavar y arreglar los dos misma pieza',
      s: [
        ['main', OC('v282Garment('), ['Start a dry cleaning drop off. Tap the garment, how many, and the color.', 'Empieza un Drop Off de Dry Cleaning. Toca la prenda, cuántas y el color.'], ['w:Pants / Trousers']],
        ['main', OC('v282OpenDryAlt'), ['On the "Special Directions" screen, tap "✂ Dry Clean + Alteration".', 'En la pantalla "Special Directions", toca "✂ Dry Clean + Alteration".'], ['w:✂ Dry Clean + Alteration']],
        ['pop', null, ['If you have more than one piece, choose WHICH piece gets the alteration. Then tap the job.', 'Si hay más de una pieza, elige CUÁL pieza lleva el arreglo. Luego toca el trabajo.'], ['c:Piece 1', 'c:Piece 2', 'w:Hem']],
        ['main', OC('v282DryNext'), ['Tap "Next →" and finish like normal.', 'Toca "Next →" y termina como siempre.'], ['b:Next →']]
      ] },
    { id: 'twocolor', cat: 'drop', ic: '🎨', t: ['Two colors or a pattern (blue & white check)', 'Dos colores o un diseño (cuadros azul y blanco)'],
      k: 'two colors 2 colors pattern stripe striped check plaid floral print multi second color dos colores diseno rayas cuadros flores',
      s: [
        ['main', OC('v282Color('), ['Pick the main color first (example: Blue).', 'Primero elige el color principal (ejemplo: Blue).'], ['c:Blue']],
        ['main', OC('v282EditPieceColor('), ['Tap "🎨 2nd color / pattern".', 'Toca "🎨 2nd color / pattern".'], ['w:🎨 2nd color / pattern']],
        ['pop', null, ['Tap the second color (White) and the pattern (Check, Stripe…). Tap Save.', 'Toca el segundo color (White) y el diseño (Check cuadros, Stripe rayas…). Toca Save.'], ['c:White', 'c:Check', 'b:Save']]
      ] },
    { id: 'rush', cat: 'drop', ic: '⚡', t: ['Rush order, stain or note on the ticket', 'Orden urgente, mancha o nota en el ticket'],
      k: 'rush fast same day express urgent hurry stain delicate defective note notes instructions comment urgente rapido mancha delicado defecto nota instrucciones',
      s: [
        ['main', OC("v282Step('finish'"), ['While making the ticket, go to "Instructions & Finish".', 'Mientras haces el ticket, ve a "Instructions & Finish".'], ['w:Instructions & Finish']],
        ['main', OC("posToggleTag('rush'"), ['Tap RUSH for a fast order. Tap Stain, Delicate or Defective if needed.', 'Toca RUSH si es urgente. Toca Stain, Delicate o Defective si hace falta.'], ['c:RUSH', 'c:Stain', 'c:Delicate', 'c:Defective']],
        ['main', 'textarea.v282-field', ['Type any note in the box (example: "button missing").', 'Escribe una nota en el cuadro (ejemplo: "falta botón").'], ['i:Visit note']],
        ['right', null, ['Change the due date on the right if it is a rush.', 'Cambia la fecha a la derecha si es urgente.'], ['w:Due Today']]
      ] },
    { id: 'aiintake', cat: 'drop', ic: '✨', t: ['Fast ticket by typing one line (AI intake)', 'Ticket rápido escribiendo una línea (AI)'],
      k: 'ai type speak voice talk fast quick sentence intake one line write magic escribir hablar voz rapido linea',
      s: [
        ['main', OC('v287Dropoff('), ['Find the customer and tap "Drop Off".', 'Busca al cliente y toca "Drop Off".'], ['b:Drop Off']],
        ['main', OC("v282Step('ai'"), ['Tap "✨ AI Speak / Type Intake".', 'Toca "✨ AI Speak / Type Intake".'], ['w:✨ AI Speak / Type Intake']],
        ['main', null, ['Type like you talk, example: "2 navy pants, 1 white blouse silk". Press Enter. Do it again for more.', 'Escribe como hablas, ejemplo: "2 navy pants, 1 white blouse silk". Presiona Enter. Repite para más.'], ['i:2 navy pants, 1 white blouse', 'k:Enter']],
        ['right', '.v282-complete', ['CHECK the right side is correct. Then tap "Complete & Print".', 'REVISA que el lado derecho esté bien. Luego toca "Complete & Print".'], ['b:Complete & Print']]
      ] },
    { id: 'multi', cat: 'drop', ic: '🧩', t: ['Many services in one visit (dry clean + shirts)', 'Varios servicios en una visita (seco + camisas)'],
      k: 'multiple services both several different two tickets separate dry clean and shirts and wash varios servicios dos tickets separados',
      s: [
        ['main', OC('v282OpenMulti'), ['After "Drop Off", tap "Multiple Services / Both".', 'Después de "Drop Off", toca "Multiple Services / Both".'], ['w:Multiple Services / Both']],
        ['main', null, ['Tick every service the customer brought. Tap "Start Selected Services".', 'Marca cada servicio que trajo el cliente. Toca "Start Selected Services".'], ['c:☑ Dry Cleaning', 'c:☑ Laundered Shirts', 'b:Start Selected Services']],
        ['main', null, ['Do one service. Tap "Done With This Service". It moves you to the next one.', 'Haz un servicio. Toca "Done With This Service". Te pasa al siguiente.'], ['b:Done With This Service']],
        ['right', '.v282-complete', ['Each service is its own ticket. Tap "Complete & Print" — all tickets print.', 'Cada servicio es su propio ticket. Toca "Complete & Print" — se imprimen todos.'], ['b:Complete & Print 2 Tickets']]
      ] },
    { id: 'hold', cat: 'drop', ic: '⏸️', t: ['Pause a ticket (Hold) and come back later', 'Pausar un ticket (Hold) y volver después'],
      k: 'hold pause wait save for later interrupted phone call resume continue held come back esperar pausar guardar continuar',
      s: [
        ['main', OC('v287HoldTicket'), ['In the middle of a ticket, tap "Hold Ticket". It is saved.', 'En medio de un ticket, toca "Hold Ticket". Se guarda.'], ['w:⏱ Hold Ticket']],
        ['main', null, ['Help the next customer.', 'Atiende al siguiente cliente.'], []],
        ['main', OC('v287ShowHeld'), ['To go back, tap "Resume Held" and tap the ticket. Everything is still there.', 'Para volver, toca "Resume Held" y toca el ticket. Todo sigue ahí.'], ['w:Resume Held']]
      ] },
    { id: 'paynow', cat: 'drop', ic: '💵', t: ['Customer wants to pay now (at drop off)', 'El cliente quiere pagar ahora (al dejar)'],
      k: 'pay now prepay pay first pay today pay at drop off cash card upfront pagar ahora antes efectivo tarjeta',
      s: [
        ['right', OC('v289OpenPayNow'), ['After you add the clothes, on the right side tap "Pay Now".', 'Después de agregar la ropa, a la derecha toca "Pay Now".'], ['w:Pay Now']],
        ['pop', null, ['Pick how they pay: Card, Cash, or Card on File.', 'Elige cómo paga: Card (tarjeta), Cash (efectivo) o Card on File (tarjeta guardada).'], ['b:Card', 'w:Cash', 'w:Card on File']],
        ['right', '.v282-complete', ['Tap "Complete & Print". The ticket will say PAID.', 'Toca "Complete & Print". El ticket dirá PAID (pagado).'], ['b:Complete & Print']],
        ['right', OC('v289PayLater'), ['Paying later? Leave "Pay When Pick Up / Delivery" selected.', '¿Paga después? Deja marcado "Pay When Pick Up / Delivery".'], ['b:✔ Pay When Pick Up / Delivery']]
      ] },
    { id: 'schedule', cat: 'drop', ic: '📅', t: ['Schedule a driver pickup from a customer\'s home', 'Programar que el chofer recoja en la casa'],
      k: 'schedule driver pickup pick up from home apartment come get collect appointment calendar programar chofer recoger casa cita',
      s: [
        ['main', 'input[placeholder^="Name / phone / address"]', ['On the Counter, type the customer\'s name or phone.', 'En el Counter, escribe el nombre o teléfono del cliente.'], ['i:Name / phone / address / customer #']],
        ['main', '.v282-result', ['Names show up under the box. Tap the right customer.', 'Aparecen nombres debajo. Toca el cliente correcto.'], ['w:Zoe Quinn · 212-555-0142']],
        ['main', OC('v287SchedulePickup('), ['Tap "Schedule Driver Pickup".', 'Toca "Schedule Driver Pickup".'], ['w:Schedule Driver Pickup']],
        ['pop', null, ['Pick the day and time. Check the address. Tap Save. A Pick-Up Order slip prints for the driver.', 'Elige día y hora. Revisa la dirección. Toca Save. Se imprime una hoja para el chofer.'], ['w:Tue Nov 3', 'w:9–11 AM', 'b:Save']]
      ] },

    /* ---------------- PICK UP & PAYMENT ---------------- */
    { id: 'pickup', cat: 'pick', ic: '🛍️', t: ['Customer picks up their clothes', 'El cliente recoge su ropa'],
      k: 'pick up pickup picking collect take home release give clothes leaving get my clothes ready order recoger entregar llevar ropa lista',
      s: [
        ['side', N('counter'), ['Tap "Counter" in the left menu.', 'Toca "Counter" en el menú de la izquierda.'], ['nav:Counter']],
        ['main', 'input[placeholder^="Name / phone / address"]', ['Type the customer\'s name or phone (or scan their ticket).', 'Escribe el nombre o teléfono (o escanea su ticket).'], ['i:Name / phone / address / customer #']],
        ['main', '.v282-result', ['Names show up under the box. Tap the right customer.', 'Aparecen nombres debajo. Toca el cliente correcto.'], ['w:Zoe Quinn · 212-555-0142']],
        ['main', OC('v287Pickup('), ['Tap "Pick Up".', 'Toca "Pick Up".'], ['b:Pick Up']],
        ['main', OC('v39ProfilePickup('), ['Their tickets show. It says where the clothes are (Rack 45). Tap "Pick Up" on the ticket.', 'Salen sus tickets. Dice dónde está la ropa (Rack 45). Toca "Pick Up" en el ticket.'], ['b:Pick Up']],
        ['pop', '.v39-pk input[type=checkbox]', ['Tick EVERY ticket the customer is taking home.', 'Marca CADA ticket que el cliente se lleva.'], ['c:☑ #700001 · Ready · Rack 45']],
        ['pop', '.v39-pay button, [onclick="v39PickDone(null)"]', ['If they owe money, tap how they paid: card, cash or check. If it is already paid, tap "Complete pickup".', 'Si deben dinero, toca cómo pagaron: tarjeta, efectivo o cheque. Si ya está pagado, toca "Complete pickup".'], ['b:Charge on Clover Flex', 'w:Paid cash', 'w:Paid check', 'b:Complete pickup']],
        ['main', null, ['Go get the clothes from the rack number. Give them to the customer. Done!', 'Busca la ropa en el número de rack. Dásela al cliente. ¡Listo!'], []]
      ] },
    { id: 'markpaid', cat: 'pick', ic: '✅', t: ['Mark a ticket paid (without pickup)', 'Marcar un ticket pagado (sin recoger)'],
      k: 'mark paid payment received record payment pay balance owe cash check paid already pagado pago marcar saldo debe cheque efectivo',
      s: [
        ['main', null, ['Open the customer (Counter → name → View Customer Profile).', 'Abre el cliente (Counter → nombre → View Customer Profile).'], ['w:View Customer Profile']],
        ['main', OC('v7RecordPayment('), ['Find the ticket and tap "Mark Paid".', 'Busca el ticket y toca "Mark Paid".'], ['w:Mark Paid']],
        ['main', OC('v288OpenCheck('), ['Paying by check? Tap "Pay by Check" and type the check number.', '¿Paga con cheque? Toca "Pay by Check" y escribe el número del cheque.'], ['w:Pay by Check']]
      ] },
    { id: 'chargeamount', cat: 'pick', ic: '💳', t: ['Charge the card on file (type an amount)', 'Cobrar la tarjeta guardada (escribir monto)'],
      k: 'charge card on file amount bill balance old ticket ar charge credit card clover run card cobrar tarjeta guardada monto cantidad saldo',
      s: [
        ['main', null, ['Open the customer\'s profile.', 'Abre el perfil del cliente.'], ['w:View Customer Profile']],
        ['main', OC('v43ChargeAmount('), ['Tap "💳 Charge an amount". (Managers only.)', 'Toca "💳 Charge an amount". (Solo gerentes.)'], ['w:💳 Charge an amount']],
        ['pop', '#v43-amt', ['Type the amount and what it is for. Check it twice!', 'Escribe el monto y para qué es. ¡Revísalo dos veces!'], ['i:$ 0.00', 'i:Old ticket #…']],
        ['pop', '#v43-go', ['Tap "Charge card". You will see Approved or Declined.', 'Toca "Charge card". Verás Approved (aprobado) o Declined (rechazado).'], ['b:Charge card']]
      ] },
    { id: 'batch', cat: 'pick', ic: '🗂️', t: ['Charge all unpaid tickets on file cards (batch)', 'Cobrar todos los tickets sin pagar (en grupo)'],
      k: 'batch charge all autopay unpaid cards on file payments end of day charge everyone cobrar todos grupo autopago',
      s: [
        ['side', N('payments'), ['Tap "Payments" in the left menu. (Managers.)', 'Toca "Payments" en el menú. (Gerentes.)'], ['nav:Payments']],
        ['main', OC('v297Mode('), ['Choose "Today" or "All unpaid up to today".', 'Elige "Today" (hoy) o "All unpaid up to today".'], ['w:Today', 'w:All unpaid up to today']],
        ['main', OC('v297Run'), ['Untick anyone you should not charge. Tap the green "Charge" button.', 'Desmarca a quien no se debe cobrar. Toca el botón verde "Charge".'], ['b:Charge 3 tickets · $61.80']]
      ] },
    { id: 'void', cat: 'pick', ic: '↩️', t: ['Void / refund (customer was charged by mistake)', 'Anular / devolver (cobro por error)'],
      k: 'void refund cancel mistake wrong charge return money undo reverse anular devolver reembolso cancelar error',
      s: [
        ['main', null, ['Do the void or refund on the Clover card machine first.', 'Primero haz la anulación o devolución en la máquina Clover.'], []],
        ['side', N('payments'), ['Tap "Payments" in the left menu.', 'Toca "Payments" en el menú.'], ['nav:Payments']],
        ['main', OC('v41CheckClover'), ['Tap "↩️ Check Clover for voids / refunds". The ticket updates and the customer gets a text. (It also checks by itself every 15 minutes.)', 'Toca "↩️ Check Clover for voids / refunds". El ticket se actualiza y el cliente recibe un mensaje. (También revisa solo cada 15 minutos.)'], ['w:↩️ Check Clover for voids / refunds']],
        ['side', N('orders'), ['To cancel a whole ticket: Ticket List → "Void" on that ticket (manager).', 'Para cancelar un ticket completo: Ticket List → "Void" en ese ticket (gerente).'], ['nav:Ticket List', 'w:Void']]
      ] },
    { id: 'edit', cat: 'pick', ic: '✏️', t: ['Fix a mistake on a ticket (edit)', 'Corregir un error en un ticket (editar)'],
      k: 'edit change fix mistake wrong price wrong garment wrong color correct ticket modify update editar cambiar corregir error precio',
      s: [
        ['main', null, ['Open the customer\'s profile.', 'Abre el perfil del cliente.'], ['w:View Customer Profile']],
        ['main', OC('v15OpenFullTicketEditor('), ['On the ticket, tap "Edit Whole Ticket".', 'En el ticket, toca "Edit Whole Ticket".'], ['w:Edit Whole Ticket']],
        ['pop', null, ['Change what is wrong (piece, color, price, date). Tap Save. Reprint if needed.', 'Cambia lo que está mal (pieza, color, precio, fecha). Toca Save. Reimprime si hace falta.'], ['b:Save', 'w:Print']]
      ] },
    { id: 'credit', cat: 'pick', ic: '🎁', t: ['Store credit or important customer note', 'Crédito de tienda o nota importante'],
      k: 'store credit gift credit discount note important note memo warning remember allergy credito nota importante descuento',
      s: [
        ['main', null, ['Open the customer\'s profile.', 'Abre el perfil del cliente.'], ['w:View Customer Profile']],
        ['main', OC('v15OpenStoreCredit('), ['Tap "Store Credit" to add or use credit.', 'Toca "Store Credit" para dar o usar crédito.'], ['w:Store Credit']],
        ['main', OC('v288EditImportantNote('), ['Tap "Important Note" for something everyone must see (example: "No starch ever").', 'Toca "Important Note" para algo que todos deben ver (ejemplo: "Nunca almidón").'], ['w:Important Note']]
      ] },

    /* ---------------- TAGS, RACK & PRINTING ---------------- */
    { id: 'print', cat: 'rack', ic: '🖨️', t: ['Print or reprint a ticket (+ key)', 'Imprimir o reimprimir un ticket (tecla +)'],
      k: 'print reprint copy ticket receipt again printer plus + key lost ticket imprimir reimprimir copia otra vez impresora tecla mas',
      s: [
        ['side', N('orders'), ['Tap "Ticket List" in the left menu.', 'Toca "Ticket List" en el menú.'], ['nav:Ticket List']],
        ['main', '#pos-content tr[data-order-id]', ['Tap the ticket you want. It turns BLUE.', 'Toca el ticket que quieres. Se pone AZUL.'], ['c:#700001 · Zoe Quinn']],
        ['key', null, ['Press the + key on the keyboard. Only that ticket prints.', 'Presiona la tecla + del teclado. Se imprime solo ese ticket.'], ['k:+']],
        ['main', OC('posPrintReceipt('), ['Or tap "Reprint" on that ticket.', 'O toca "Reprint" en ese ticket.'], ['w:Reprint']],
        ['key', null, ['Tip: pressing + on any screen reprints the LAST ticket printed.', 'Consejo: presionar + en cualquier pantalla reimprime el ÚLTIMO ticket.'], ['k:+']]
      ] },
    { id: 'tag', cat: 'rack', ic: '🏷️', t: ['Put a tag number on a ticket (Tag Assign)', 'Poner número de etiqueta (Tag Assign)'],
      k: 'tag tags assign tag number pin tag paper tag color tag label marking etiqueta etiquetas numero asignar marcar',
      s: [
        ['side', N('tags'), ['Tap "Tag Assign" in the left menu.', 'Toca "Tag Assign" en el menú.'], ['nav:Tag Assign']],
        ['scan', 'input[placeholder^="Scan ticket barcode"]', ['Scan the ticket barcode (or type the ticket number and press Enter).', 'Escanea el código del ticket (o escribe el número y presiona Enter).'], ['i:Scan ticket barcode or type ticket #']],
        ['main', 'input[placeholder="One tag #"]', ['Type the tag number (example: 3-821).', 'Escribe el número de etiqueta (ejemplo: 3-821).'], ['i:One tag #']],
        ['main', OC('v21SaveTag('), ['Tap "Save Tag".', 'Toca "Save Tag".'], ['b:Save Tag']]
      ] },
    { id: 'ready', cat: 'rack', ic: '✅', t: ['Mark clothes READY (scan to conveyor)', 'Marcar ropa LISTA (escanear al transportador)'],
      k: 'ready done finished mark ready conveyor scan clean back from plant complete lista terminada transportador escanear',
      s: [
        ['side', N('rack'), ['Tap "Rack" in the left menu.', 'Toca "Rack" en el menú.'], ['nav:Rack']],
        ['scan', '#v3-conveyor-input', ['Tap the top box "Scan to Conveyor · Mark Ready". Scan the barcode on the ticket or tag.', 'Toca el cuadro de arriba "Scan to Conveyor · Mark Ready". Escanea el código del ticket o etiqueta.'], ['i:Scan barcode, ticket or tag']],
        ['main', OC('v3SubmitConveyorScan'), ['It marks it ready by itself. (Or tap "Mark Ready".) It gives a conveyor number.', 'Se marca lista sola. (O toca "Mark Ready".) Te da un número de transportador.'], ['b:Mark Ready']],
        ['main', null, ['If the customer said YES to texts, they get a "your order is ready" text.', 'Si el cliente dijo YES a mensajes, recibe un texto "su orden está lista".'], []]
      ] },
    { id: 'rackassign', cat: 'rack', ic: '🗄️', t: ['Put an order on a rack number', 'Poner una orden en un número de rack'],
      k: 'rack location assign rack shelf hang put away slot number where store place rack ubicacion colgar numero lugar',
      s: [
        ['side', N('rack'), ['Tap "Rack" in the left menu.', 'Toca "Rack" en el menú.'], ['nav:Rack']],
        ['main', 'input[placeholder^="Example: 3-821"]', ['In "Look up", type the ticket, tag or customer name.', 'En "Look up", escribe el ticket, la etiqueta o el nombre.'], ['i:Example: 3-821, HAT-004821, Raber']],
        ['main', 'input[id^="rack-input-"]', ['On that ticket, type the rack number (1–2000).', 'En ese ticket, escribe el número de rack (1–2000).'], ['i:Type 1–2000']],
        ['main', OC('v6AssignTypedRack('), ['Tap "Assign & Ready" (or press Enter). Hang the clothes on that rack.', 'Toca "Assign & Ready" (o presiona Enter). Cuelga la ropa en ese rack.'], ['b:Assign & Ready']]
      ] },
    { id: 'where', cat: 'rack', ic: '📍', t: ['Where is this order? (find clothes)', '¿Dónde está esta orden? (buscar ropa)'],
      k: 'where is find order locate lost missing clothes rack number status ticket search track donde esta buscar orden perdida estado',
      s: [
        ['side', N('orders'), ['Tap "Ticket List".', 'Toca "Ticket List".'], ['nav:Ticket List']],
        ['main', 'input[placeholder^="Ticket, barcode, customer #"]', ['Type the ticket number, name or phone.', 'Escribe el número de ticket, nombre o teléfono.'], ['i:Ticket, barcode, customer #, name, phone…']],
        ['main', OC('posOpenOrderDetail('), ['Look at the row: it shows the status and Rack / Conveyor number. Tap "Detail" for more.', 'Mira la línea: dice el estado y el número de Rack / Conveyor. Toca "Detail" para más.'], ['w:Detail']]
      ] },
    { id: 'todo', cat: 'rack', ic: '📋', t: ['What needs to be done today? (To Be Done)', '¿Qué hay que hacer hoy? (To Be Done)'],
      k: 'to do todo to be done list today tasks overdue due today late what next work pending pendiente hoy tareas atrasado',
      s: [
        ['side', N('todo'), ['Tap "To Be Done" in the left menu.', 'Toca "To Be Done" en el menú.'], ['nav:To Be Done']],
        ['main', OC('v12TodoRoute('), ['Each box has a number. Tap a box to see those tickets (example: "Need Physical Tags").', 'Cada cuadro tiene un número. Toca un cuadro para ver esos tickets (ejemplo: "Need Physical Tags").'], ['w:1  Need Physical Tags', 'w:0  Tickets Overdue']],
        ['main', null, ['Try to get every number to 0 before closing.', 'Trata de dejar todos los números en 0 antes de cerrar.'], []]
      ] },

    /* ---------------- CARDS & TEXTS ---------------- */
    { id: 'cardlink', cat: 'card', ic: '📱', t: ['Save a customer\'s card (text them a secure link)', 'Guardar la tarjeta del cliente (mandar enlace seguro)'],
      k: 'save card card on file add card store card link text link secure credit card new card update card guardar tarjeta enlace agregar nueva',
      s: [
        ['main', null, ['Open the customer\'s profile.', 'Abre el perfil del cliente.'], ['w:View Customer Profile']],
        ['main', OC('v37TextCardLink('), ['Tap "📱 Text card link". The customer gets a text with a safe link.', 'Toca "📱 Text card link". El cliente recibe un mensaje con un enlace seguro.'], ['w:📱 Text card link']],
        ['main', null, ['The customer types their card on THEIR phone. We never see the full number.', 'El cliente escribe su tarjeta en SU teléfono. Nunca vemos el número completo.'], []],
        ['top', OC('v38ToggleAlerts'), ['When they finish, the 🔔 bell lights up and the card shows on their profile.', 'Cuando termina, la campana 🔔 se prende y la tarjeta aparece en su perfil.'], ['w:🔔']],
        ['main', null, ['Never write card numbers on paper or type them in notes.', 'Nunca escribas números de tarjeta en papel ni en notas.'], []]
      ] },
    { id: 'receipt', cat: 'card', ic: '🧾', t: ['Text the customer a receipt', 'Mandar el recibo por mensaje'],
      k: 'receipt text receipt send receipt copy email proof sms recibo mandar copia mensaje',
      s: [
        ['main', null, ['Open the customer\'s profile.', 'Abre el perfil del cliente.'], ['w:View Customer Profile']],
        ['main', OC('v39TextReceipt('), ['On the ticket, tap "📱 Text receipt".', 'En el ticket, toca "📱 Text receipt".'], ['w:📱 Text receipt']]
      ] },
    { id: 'doover', cat: 'card', ic: '🔁', t: ['Stain did not come out (Do Over text)', 'La mancha no salió (mensaje Do Over)'],
      k: 'do over redo again re clean stain not out still dirty reclean pack ask customer otra vez mancha no salio limpiar de nuevo',
      s: [
        ['main', null, ['Open the customer\'s profile.', 'Abre el perfil del cliente.'], ['w:View Customer Profile']],
        ['main', OC('v38DoOver('), ['Tap "🔁 Do Over".', 'Toca "🔁 Do Over".'], ['w:🔁 Do Over']],
        ['pop', '.v38-do input', ['Tick the ticket. You can also tick which piece (optional).', 'Marca el ticket. También puedes marcar cuál pieza (opcional).'], ['c:☑ #700001', 'c:☑ Blouse (optional)']],
        ['pop', null, ['Tap Submit. The customer gets a text: reply AGAIN (re-clean free) or PACK (pack it).', 'Toca Submit. El cliente recibe un texto: responde AGAIN (limpiar otra vez gratis) o PACK (empacar).'], ['b:Submit']],
        ['top', OC('v38ToggleAlerts'), ['Their answer shows in the 🔔 bell.', 'Su respuesta sale en la campana 🔔.'], ['w:🔔']]
      ] },
    { id: 'bell', cat: 'card', ic: '🔔', t: ['The bell 🔔 — messages and alerts', 'La campana 🔔 — mensajes y avisos'],
      k: 'bell alert alerts notification notifications message reply customer replied text back new card tailor campana aviso avisos notificacion respuesta',
      s: [
        ['top', OC('v38ToggleAlerts'), ['Tap the 🔔 bell at the top right. A red number means something new.', 'Toca la campana 🔔 arriba a la derecha. Un número rojo quiere decir algo nuevo.'], ['w:🔔 2']],
        ['top', null, ['You will see: customer text replies, new saved cards, Do Over answers, voids, tailor orders.', 'Verás: respuestas de clientes, tarjetas nuevas, respuestas Do Over, anulaciones, órdenes del sastre.'], []],
        ['top', null, ['Tap an alert to open that customer. If a customer asks a question, tell a manager or call them back.', 'Toca un aviso para abrir ese cliente. Si un cliente pregunta algo, dile al gerente o llámalo.'], []]
      ] },

    /* ---------------- TAILOR ---------------- */
    { id: 'tailornew', cat: 'tailor', ic: '🎙️', t: ['Tailor: write up an order (iPad, speak or type)', 'Sastre: hacer una orden (iPad, hablar o escribir)'],
      k: 'tailor ipad fitting measure pin speak voice microphone mic new order tailor order sastre medir hablar voz microfono orden',
      s: [
        ['side', N('tailor'), ['Tap "Tailor" in the left menu.', 'Toca "Tailor" en el menú.'], ['nav:Tailor']],
        ['main', OC("v44Tab('new'"), ['Tap "🎙 New order".', 'Toca "🎙 New order".'], ['w:🎙 New order']],
        ['main', '#v44-cq', ['Type the customer\'s name and tap it.', 'Escribe el nombre del cliente y tócalo.'], ['i:Customer name or phone']],
        ['main', OC('v44Mic'), ['Tap the 🎤 microphone and SAY the work. Example: "hem 2 navy pants and shorten the jacket sleeves". Tap again to stop.', 'Toca el micrófono 🎤 y DI el trabajo. Ejemplo: "hem 2 navy pants and shorten the jacket sleeves". Toca otra vez para parar.'], ['w:🎤']],
        ['main', '#v44-type', ['Or TYPE it in the box and tap "Add".', 'O ESCRÍBELO en el cuadro y toca "Add".'], ['i:hem 2 navy pants…', 'b:Add']],
        ['main', OC('v44Send'), ['Check the list and the prices. Tap "Send to counter →".', 'Revisa la lista y precios. Toca "Send to counter →".'], ['b:Send to counter →']]
      ] },
    { id: 'tailorcheckout', cat: 'tailor', ic: '🧾', t: ['Counter: check out an order from the tailor', 'Mostrador: cobrar una orden del sastre'],
      k: 'from the tailor check out checkout tailor order counter banner handoff sent from tailor del sastre cobrar mostrador',
      s: [
        ['side', N('counter'), ['Tap "Counter". At the top you will see "✂ From the tailor".', 'Toca "Counter". Arriba verás "✂ From the tailor".'], ['nav:Counter']],
        ['main', '.v44-counter .btn-primary', ['Tap "Check out" next to the customer.', 'Toca "Check out" al lado del cliente.'], ['b:Check out']],
        ['right', '.v282-complete', ['The work is already on the ticket. Check the due date, then tap "Complete & Print".', 'El trabajo ya está en el ticket. Revisa la fecha y toca "Complete & Print".'], ['b:Complete & Print']]
      ] },
    { id: 'tailorwork', cat: 'tailor', ic: '📋', t: ['Tailor: today\'s work list (Start / Done)', 'Sastre: trabajo de hoy (Start / Done)'],
      k: 'tailor work list today queue start done finished capacity busy how many jobs sastre trabajo hoy lista empezar terminado',
      s: [
        ['side', N('tailor'), ['Tap "Tailor".', 'Toca "Tailor".'], ['nav:Tailor']],
        ['main', OC("v44Tab('work'"), ['Tap "📋 Today\'s work". Most urgent is at the top. Same jobs are grouped (all navy hems together).', 'Toca "📋 Today\'s work". Lo más urgente arriba. Trabajos iguales juntos (todos los hems azul marino).'], ['w:📋 Today\'s work']],
        ['main', OC('v44Status('), ['Tap "Start" when you begin a job. Tap "Done ✓" when it is finished.', 'Toca "Start" al empezar. Toca "Done ✓" al terminar.'], ['w:Start', 'b:Done ✓']],
        ['main', OC("v44Tab('cap'"), ['"📅 Capacity" shows how full each day is.', '"📅 Capacity" muestra qué tan lleno está cada día.'], ['w:📅 Capacity']]
      ] },

    /* ---------------- DELIVERY ---------------- */
    { id: 'delivery', cat: 'deliv', ic: '🚚', t: ['Send orders out for delivery (driver)', 'Mandar órdenes con el chofer (entrega)'],
      k: 'delivery deliver driver route bag send out van truck drop off at home manifest proof entrega chofer ruta bolsa mandar',
      s: [
        ['side', N('delivery'), ['Tap "Delivery" in the left menu.', 'Toca "Delivery" en el menú.'], ['nav:Delivery']],
        ['scan', 'input[placeholder^="Scan unique barcode"]', ['Scan each bag\'s barcode in "Scan for Delivery".', 'Escanea el código de cada bolsa en "Scan for Delivery".'], ['i:Scan unique barcode, ticket or tag']],
        ['main', OC('v8SubmitDeliveryScan'), ['Tap "Add" if it does not add by itself.', 'Toca "Add" si no se agrega solo.'], ['b:Add']],
        ['main', null, ['The orders go to the driver\'s route. The driver takes a photo when delivered.', 'Las órdenes van a la ruta del chofer. El chofer toma una foto al entregar.'], ['w:📷 Proof of delivery']]
      ] },

    /* ---------------- SOMETHING IS WRONG ---------------- */
    { id: 'frozen', cat: 'fix', ic: '🔄', t: ['Screen is stuck, old, or not updating', 'La pantalla está trabada o no se actualiza'],
      k: 'frozen stuck slow not working not updating refresh reload old version blank white screen broken bug error trabado lento no funciona actualizar recargar pantalla blanca',
      s: [
        ['key', null, ['Hold Ctrl and Shift, then press R. The page reloads with the newest version.', 'Mantén Ctrl y Shift, y presiona R. La página se recarga con lo más nuevo.'], ['k:Ctrl', 'k:Shift', 'k:R']],
        ['top', null, ['Look at the top right: "Saved · Live" in green means everything is saved.', 'Mira arriba a la derecha: "Saved · Live" en verde quiere decir que todo está guardado.'], ['c:✔ Saved · Live']],
        ['main', null, ['Still stuck? Close Edge and open the "Hattan POS" shortcut on the desktop again.', '¿Sigue trabado? Cierra Edge y abre otra vez el acceso "Hattan POS" del escritorio.'], ['w:Hattan POS']]
      ] },
    { id: 'printer', cat: 'fix', ic: '🧻', t: ['Ticket printer is not printing', 'La impresora de tickets no imprime'],
      k: 'printer not printing paper jam roll star thermal no print print screen pops up dialog impresora no imprime papel rollo',
      s: [
        ['main', null, ['Check the printer: is the light on? Is there paper? Is the lid closed tight?', 'Revisa la impresora: ¿tiene luz? ¿tiene papel? ¿la tapa está bien cerrada?'], []],
        ['main', null, ['Change paper: open the lid, drop the roll in with paper coming out from the bottom toward you, close the lid.', 'Cambiar papel: abre la tapa, pon el rollo con el papel saliendo por abajo hacia ti, cierra la tapa.'], []],
        ['key', null, ['Press + to print the last ticket again.', 'Presiona + para imprimir otra vez el último ticket.'], ['k:+']],
        ['main', null, ['A print window pops up? You opened the POS the wrong way. Close Edge and use the "Hattan POS" desktop shortcut.', '¿Sale una ventana de impresión? Abriste el POS de otra forma. Cierra Edge y usa el acceso "Hattan POS" del escritorio.'], ['w:Hattan POS']]
      ] },
    { id: 'declined', cat: 'fix', ic: '⛔', t: ['Card was declined', 'La tarjeta fue rechazada'],
      k: 'declined decline card denied failed not approved error payment failed rejected rechazada tarjeta no aprobada fallo',
      s: [
        ['main', null, ['Tell the customer kindly: "The card did not go through."', 'Dile al cliente con amabilidad: "La tarjeta no pasó."'], []],
        ['main', null, ['Ask for another card or cash. Or tap "📱 Text card link" so they can put a new card on file.', 'Pide otra tarjeta o efectivo. O toca "📱 Text card link" para que pongan una tarjeta nueva.'], ['w:📱 Text card link']],
        ['main', null, ['Never try the same card over and over.', 'Nunca intentes la misma tarjeta una y otra vez.'], []]
      ] },
    { id: 'manager', cat: 'fix', ic: '📞', t: ['I still need help — call the manager', 'Todavía necesito ayuda — llamar al gerente'],
      k: 'help manager call phone owner boss ask someone problem emergency ayuda gerente llamar dueno jefe problema emergencia',
      s: [
        ['main', null, ['Do not guess with money or customer cards. It is OK to wait.', 'No adivines con dinero ni tarjetas de clientes. Está bien esperar.'], []],
        ['main', null, ['Write down: customer name, ticket number, and what happened.', 'Anota: nombre del cliente, número de ticket y qué pasó.'], []],
        ['main', null, ['Call or text the manager. Store phone: 212-477-1740.', 'Llama o manda mensaje al gerente. Teléfono de la tienda: 212-477-1740.'], []]
      ] }
  ];

  /* short how-to videos (recorded on a demo copy with pretend customers) */
  const VIDEOS = ['dropdry', 'pickup', 'find', 'print', 'ready', 'rackassign', 'tag', 'cardlink', 'chargeamount', 'textyes'];
  const VIDEO_V = 2;
  const hasVideo = id => VIDEOS.includes(id) || /^learn/.test(id);
  const videoSrc = id => `help-videos/${id}.mp4?v=${VIDEO_V}`;

  /* screen → topics shown first ("On this screen") */
  const SCREEN = {
    login: ['signin', 'clock'], counter: ['dropdry', 'pickup', 'find', 'paynow', 'hold', 'tailorcheckout'], customers: ['newcust', 'pickup', 'chargeamount', 'cardlink'],
    orders: ['print', 'where', 'void'], tags: ['tag'], rack: ['ready', 'rackassign', 'where'], tailor: ['tailornew', 'tailorwork'], delivery: ['delivery', 'schedule'],
    payments: ['batch', 'void', 'chargeamount'], todo: ['todo'], team: ['clock']
  };

  /* ---------------- language ---------------- */
  let HL = null; // help-only language override
  const L = () => (HL || (window.state && state.language === 'es' ? 'es' : 'en')) === 'es' ? 1 : 0;
  const UI_T = {
    help: ['Help', 'Ayuda'], title: ['How do I…?', '¿Cómo hago…?'], ph: ['Type what you want to do… (example: pick up, print, charge card)', 'Escribe lo que quieres hacer… (ejemplo: recoger, imprimir, cobrar)'],
    onscreen: ['On this screen', 'En esta pantalla'], all: ['All guides', 'Todas las guías'], showme: ['👉 Show me on the screen', '👉 Muéstrame en la pantalla'],
    read: ['🔊 Read to me', '🔊 Léemelo'], watch: ['▶ Watch video', '▶ Ver video'], hidevid: ['✕ Close video', '✕ Cerrar video'], videos: ['Watch & learn (videos)', 'Mira y aprende (videos)'], training: ['Training videos — dry cleaning know-how', 'Videos de entrenamiento'], training2: ['Intermediate training — back room & packing', 'Entrenamiento intermedio — taller y empaque'], keypts: ['Key points', 'Puntos clave'], voiceon: ['🔊 Voice: ON', '🔊 Voz: SÍ'], voiceoff: ['🔇 Voice: OFF', '🔇 Voz: NO'], vidnote: ['Video is in English. The glowing button shows where to tap.', 'El video está en inglés. El botón que brilla muestra dónde tocar.'], stop: ['⏹ Stop reading', '⏹ Parar'], back: ['← Back', '← Atrás'], close: ['Close', 'Cerrar'], step: ['Step', 'Paso'],
    of: ['of', 'de'], next: ['Next ▶', 'Siguiente ▶'], prev: ['◀ Back', '◀ Atrás'], done: ['Finish ✓', 'Terminar ✓'], quit: ['✕ Stop', '✕ Salir'],
    none: ['No guide found for that. Try one or two simple words, like "pick up", "print", "rack" or "card".', 'No encontramos una guía. Prueba una o dos palabras, como "recoger", "imprimir", "rack" o "tarjeta".'],
    ask: ['Still stuck? Ask a manager or call 212-477-1740.', '¿Sigues con dudas? Pregunta al gerente o llama al 212-477-1740.'],
    notyet: ['Can\'t see this button yet. Do the step before first — or press Back.', 'Todavía no se ve este botón. Haz el paso anterior primero — o toca Atrás.'],
    tapit: ['Tap the glowing button.', 'Toca el botón que brilla.'], typeit: ['Type in the glowing box, then press Next.', 'Escribe en el cuadro que brilla y toca Siguiente.'],
    where: { side: ['Left menu', 'Menú izquierdo'], top: ['Top bar', 'Barra de arriba'], main: ['Middle of screen', 'Centro de la pantalla'], right: ['Right side', 'Lado derecho'], pop: ['Pop-up box', 'Ventana que sale'], key: ['Keyboard', 'Teclado'], scan: ['Scanner', 'Escáner'] },
    finished: ['Great job! 🎉', '¡Muy bien! 🎉'], tip: ['Tip: press F1 any time to open Help.', 'Consejo: presiona F1 cuando quieras para abrir Ayuda.']
  };
  const tx = k => UI_T[k][L()];

  /* ---------------- search ---------------- */
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\+/g, ' plus ').replace(/[^a-z0-9中文 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const STOP = new Set('how do i to a an the what where can my is it in on of for and or with we you me please want need does should when this that como hago para el la los las un una de que en y mi se puedo quiero necesito por con al lo le'.split(' '));
  const SYN = { pickup: 'pick up', pu: 'pick up', dropoff: 'drop off', recoger: 'pick up', dejar: 'drop off', cobrar: 'charge', tarjeta: 'card', imprimir: 'print', etiqueta: 'tag', lista: 'ready', cc: 'card', reprint: 'print', receipt: 'receipt', hem: 'alteration hem', sastre: 'tailor' };
  function lev1(a, b) { // edit distance ≤ 1?
    if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  function swap1(a, b) { if (a.length !== b.length) return false; const d = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i); return d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]]; }

  /* ---------------- training videos (knowledge, not buttons) ---------------- */
  const LEARN = [
    { id: 'learn_how', ic: '🧼', t: ['How dry cleaning works', 'Cómo funciona la limpieza en seco'], k: 'how dry cleaning works process solvent water steps machine what is dry cleaning really dry como funciona proceso solvente',
      pts: ['Dry cleaning uses a special liquid called solvent — not water.', 'Water can shrink wool, spot silk and make colors run. Solvent is gentle.', '6 steps: check & tag → treat stains → clean → dry → press → inspect & bag.', 'The solvent is filtered, cleaned and used again.'] },
    { id: 'learn_fabrics1', ic: '🧶', t: ['Fabrics part 1: natural fabrics', 'Telas parte 1: naturales'], k: 'fabric fabrics material cotton linen wool silk cashmere natural difference tela telas algodon lino lana seda',
      pts: ['Cotton: strong plant fabric, most shirts, can shrink in hot water.', 'Linen: from flax, cool and crisp, wrinkles very easily.', 'Wool: from sheep, suits & coats, shrinks with hot water → dry clean.', 'Silk: shiny and light, water can spot it → dry clean.', 'Cashmere: from goats, very soft, handle gently.', 'Pick wool/silk/cashmere/linen on the ticket. Not sure? Ask a manager.'] },
    { id: 'learn_fabrics2', ic: '🧵', t: ['Fabrics part 2: man-made fabrics', 'Telas parte 2: sintéticas'], k: 'fabric fabrics polyester nylon rayon viscose acetate spandex elastane lycra blend synthetic leather suede fur tela sintetica',
      pts: ['Polyester: plastic-based, few wrinkles, too much heat makes it shiny or melts it.', 'Nylon: strong and light, low heat.', 'Rayon / viscose: very weak when wet, can shrink → dry clean.', 'Acetate: shiny linings, low heat, perfume and nail polish remover can melt it.', 'Spandex: stretch — heat can ruin it.', 'Blends: treat like the most delicate fabric in the mix.', 'Leather, suede, fur, wedding gowns: ask a manager.'] },
    { id: 'learn_stains', ic: '🔎', t: ['What stains look like', 'Cómo se ven las manchas'], k: 'stain stains spot oil grease coffee tea wine sweat yellow ink blood makeup lipstick grass rust wax gum sugar invisible come out mancha manchas',
      pts: ['Always ask: What is it? How old is it?', 'Oil: dark and see-through. Coffee/tea/wine: ring at the edge. Sweat: yellow at arms and collar.', 'Ink: blue/black lines near pockets. Blood: red-brown, heat sets it. Rust: orange dots.', 'Soda, juice and white wine can be invisible now and turn brown with heat.', 'Say: “We will do our best, but we can’t promise.” Tap Stain on the ticket.', 'Customer tip: blot, don’t rub. No hot water, iron or dryer.'] },
    { id: 'learn_shirts1', ic: '👔', t: ['Wash & press vs dry clean shirts', 'Camisas: lavar y planchar vs en seco'], k: 'shirt shirts wash and press laundered laundry dry clean difference starch hanger box crisp camisa camisas lavar planchar almidon',
      pts: ['Wash & press: washed in water, pressed on a hot shirt machine, very crisp, costs less.', 'Dry clean: cleaned in solvent, pressed gently, softer, less shrinking and fading, costs more.', 'Water is best for sweat. Solvent is best for oil and delicate fabric.', 'Ask: which starch (none, light, medium, heavy) and hanger or box.'] },
    { id: 'learn_shirts2', ic: '❓', t: ['Why only shirts get wash & press', 'Por qué solo camisas se lavan y planchan'], k: 'why only shirts cant cannot can not wash and press pants suit jacket sweater dress coat why not launder other garments clothes por que solo camisas',
      pts: ['The shirt press machine is shaped like a shirt — other clothes don’t fit it.', 'Cotton shirts handle water, high heat and starch.', 'Suits and jackets have linings and padding that bubble and pucker in water.', 'Wool shrinks, sweaters lose shape, dresses can run colors.', 'Shirts → wash & press. Almost everything else → dry clean.'] },
    { id: 'learn_shirts3', ic: '🚦', t: ['Which shirts can be washed & pressed', 'Qué camisas se pueden lavar y planchar'], k: 'which shirts colors fabric wash and press silk linen rayon dark colors stretch buttons mother of pearl embroidery label safe que camisas colores',
      pts: ['✅ Yes: white & light cotton, cotton-poly blends, oxford/poplin/broadcloth, business shirts.', '⚠️ Careful: very dark or bright colors, linen, stretch shirts, mother-of-pearl or fancy buttons.', '🛑 Dry clean: silk, rayon/viscose, embroidery/beads/sequins/lace, thin, vintage or designer.', 'Fitted blouses don’t fit the shirt machine → dry clean.', 'When in doubt: dry clean and ask a manager.'] },
    { id: 'learn_nodryclean', ic: '🚫', t: ['Clothes that cannot be dry cleaned', 'Ropa que no se puede limpiar en seco'], k: 'cannot dry clean can not not allowed pleather faux leather vinyl glued sequins beads rubber print plastic rug bath mat raincoat leather suede fur no se puede',
      pts: ['Fake leather, vinyl and coated fabrics can peel, crack or go stiff.', 'Glued sequins, beads and gems can fall off.', 'Rubber, plastic, foil and glitter prints can crack or melt.', 'Rubber-backed bath mats and rugs crumble.', 'Circle with an X on the label = do not dry clean.', 'Real leather, suede, fur: special cleaner — ask a manager. Never guess.'] },
    { id: 'learn_labels', ic: '🏷️', t: ['Reading care labels', 'Leer etiquetas de cuidado'], k: 'care label labels symbols tag instructions circle triangle square iron tub dry clean only wash etiqueta simbolos',
      pts: ['Tub = washing (dots = how hot). Triangle = bleach. Square = drying. Iron = ironing. Circle = dry clean.', 'Any symbol with an X means NO.', '“Dry clean” = suggested. “Dry clean ONLY” = must.', 'Labels can be wrong — when unsure, ask a manager.'] },
    { id: 'learn_faq', ic: '💬', t: ['Top 10 customer questions', 'Las 10 preguntas más comunes'], k: 'customer questions answers faq what to say ask how long ready rush shrink price cost why expensive delivery pickup preguntas clientes respuestas',
      pts: ['Stain: “We’ll do our best, but we can’t promise.”', 'Ready: due date is on the ticket; we text if they said yes.', 'Faster: mark RUSH and check with the manager.', 'Silk/wool cost more: extra time, care and hand pressing.', 'Not really dry: special liquid instead of water.', 'Problems, money or refunds: get the manager. Never promise.'] }
  ];
  LEARN.forEach(l => TOPICS.push(Object.assign({ cat: 'learn', learn: true, s: [] }, l)));
  const LEARN2 = [
    { id: 'learn2_tagging', ic: '🏷️', t: ['How to tag garments the right way', 'Cómo etiquetar la ropa'], k: 'tag tagging staple stapler pin safety pin tag gun where to put tag label collar waistband suit both pieces etiquetar grapa alfiler',
      pts: ['Staple or pin through the LABEL — never through the fabric.', 'Shirts: collar label or side-seam care label. Pants/skirts: back waistband label.', 'Jackets & suits: brand label inside the neck. Tag BOTH suit pieces, same number.', 'Sweaters, knits, silk & dresses: safety pin to the label.', 'No label: safety pin through an inside seam, or loop on a belt loop/button.', 'Check: clear number that matches the ticket, one tag per piece, tug to test.'] },
    { id: 'learn2_tagmistakes', ic: '⚠️', t: ['Tagging mistakes that damage clothes', 'Errores al etiquetar que dañan la ropa'], k: 'tagging mistakes damage holes snag run staple silk satin leather suede knit lining rust rip tag off wrong number lost piece errores dano agujeros',
      pts: ['Staples in silk, satin, leather, suede or knits make permanent holes and runs.', 'Never staple through two layers (lining + outside).', 'Metal staples can rust in wash & press — keep them small and in the label.', 'Tags on the outside can leave press marks.', 'Messy numbers and untagged suit pieces get lost or go to the wrong customer.', 'Use a staple remover. Never rip a tag. Made a hole? Tell a manager right away.'] },
    { id: 'learn2_inspect', ic: '🔍', t: ['Checking clothes at drop-off', 'Revisar la ropa al recibirla'], k: 'inspect inspection check drop off pockets pen buttons holes tears moth stains belts hood fur collar count pieces damage defective note revisar bolsillos botones',
      pts: ['Empty every pocket — pens ruin whole loads. Give back money, cards, keys.', 'Check buttons, holes, tears, moth holes, worn elbows, collars and hems.', 'Look for stains and ask what they are.', 'Belts, hoods, fur collars, removable linings: tag them or give them back.', 'Count pieces with the customer.', 'Found something? Show the customer, tap Stain/Defective, write a short note.'] },
    { id: 'learn2_assembly', ic: '🧩', t: ['Matching clothes to tickets (assembly)', 'Juntar la ropa con su ticket'], k: 'assembly assemble match matching tag ticket count pieces colors sets together missing piece mark ready rack juntar ordenar contar',
      pts: ['Read the tag → find the same ticket (type the tag # in Ticket List).', 'Count pieces and check every color against the ticket.', 'Suit jacket and pants always stay together.', 'Mark ready and rack it only when every piece is there.', 'Missing piece? Don’t bag it — check cleaning & pressing, then tell a manager.'] },
    { id: 'learn2_qc', ic: '🔎', t: ['Final check before bagging', 'Revisión final antes de embolsar'], k: 'final check quality control qc inspect before bagging stain still there pressing crease double crease buttons threads lint inside out smell revision final calidad',
      pts: ['Stain still there → back for re-spotting; can’t come out → manager / Do Over text.', 'Pants: one sharp crease. Collars smooth. No shiny marks.', 'All buttons there, none cracked.', 'Snip threads, lint roll dark clothes, turn right side out.', 'Should smell clean.', 'If it’s not right, it doesn’t get bagged.'] },
    { id: 'learn2_suit', ic: '🤵', t: ['How to check and pack a suit', 'Cómo revisar y empacar un traje'], k: 'suit pack packing suit jacket pants vest hanger wide hanger crease lapels shoulders match color navy black check empacar traje gancho',
      pts: ['Jacket and pants: same tag number, same fabric and color (navy vs black!).', 'Pants: one sharp crease, even cuffs. Lapels roll softly, no shine.', 'Wide suit hanger — never a thin wire hanger.', 'Pants folded over the bar on the crease; jacket shoulders on the hanger ends.', 'Top button closed, pocket flaps out, vest under the jacket.', 'One suit, one hanger, one bag, ticket outside.'] },
    { id: 'learn2_packorder', ic: '📦', t: ['Packing a mixed order: what goes first', 'Empacar una orden mixta: qué va primero'], k: 'pack packing order mixed bag which first last back front coat dress suit pants shirts silk delicate folded sweater comforter tie empacar orden primero ultimo',
      pts: ['Back to front: heavy & long first, light & delicate last.', 'Order: coats → dresses & long items → suits & jackets → pants & skirts → shirts → silk & delicates.', 'Folded items and boxed shirts in their own box or bag — never under hangers.', 'Comforters and blankets in their own bag. Ties & scarves on a hanger.', 'Hooks face the same way, count = ticket, ticket on the outside.'] },
    { id: 'learn2_shirtpack', ic: '👔', t: ['Packing shirts: hanger or box', 'Empacar camisas: gancho o caja'], k: 'shirt shirts pack packing hanger box boxed folded fold shirt board collar buttons starch camisas gancho caja doblar',
      pts: ['Hanger: one shirt per hanger, top & middle buttons closed, collar flat, sleeves straight.', 'All shirts face the same way, together in one bag.', 'Box: fold on a shirt board, every button closed, collar standing up.', 'Add collar support and band; stack all facing the same way.', 'Check starch, buttons, collar stains, and count = ticket.'] },
    { id: 'learn2_delivery', ic: '🚚', t: ['Getting delivery orders ready', 'Preparar órdenes para entrega'], k: 'delivery deliver driver van bag label apartment address paid unpaid scan route photo proof entrega chofer bolsa apartamento',
      pts: ['Order complete and checked.', 'Paid or card on file (unpaid ones show in To Be Done).', 'Check address and apartment # on the ticket.', 'Name and big apartment # on the outside of every bag; folded items in their own labeled bag.', 'Scan every bag in Delivery; driver photos the drop-off.', 'In the van: hang long pieces, group by building, nothing on the floor.'] },
    { id: 'learn2_mixup', ic: '🔁', t: ['Wrong garment to the wrong customer: how to fix it', 'Ropa equivocada al cliente equivocado'], k: 'wrong garment wrong customer mix up mixed up gave wrong order swapped backtrack find owner tag number search fix mistake picked up wrong delivered wrong ropa equivocada cliente equivocado',
      pts: ['Say sorry, stay calm, never argue or blame.', 'Read the tag on the wrong garment and type the tag # in Ticket List to find the real owner.', 'Open Detail to confirm pieces and colors.', 'The first customer’s own garment is usually still here — check the rack near the other order.', 'Wrongly marked picked up/delivered? Ticket List → Backtrack, type the reason, then mark ready and re-rack.', 'Add a note and tell a manager; they arrange the swap.', 'Prevent it: check name, ticket # and tag #, count pieces, scan the barcode.'] }
  ];
  LEARN2.forEach(l => TOPICS.push(Object.assign({ cat: 'learn', learn: true, level: 2, s: [] }, l)));


  const IDX = TOPICS.map(t => ({ t, title: norm(t.t[0] + ' ' + t.t[1]).split(' '), words: norm(t.k + ' ' + t.t[0] + ' ' + t.t[1]).split(' '), full: norm(t.k + ' ' + t.t[0] + ' ' + t.t[1]) }));
  function search(q) {
    let nq = norm(q); if (!nq) return [];
    const toks = nq.split(' ').flatMap(w => (SYN[w] || w).split(' ')).filter(w => w && !STOP.has(w));
    if (!toks.length) return [];
    const res = IDX.map(x => {
      let score = 0;
      if (x.full.includes(nq) && nq.length > 3) score += 6;
      toks.forEach(tok => {
        const hit = ws => ws.some(w => w === tok || (tok.length >= 3 && w.startsWith(tok)) || (w.length >= 4 && tok.startsWith(w)) || (tok.length >= 5 && (lev1(tok, w) || swap1(tok, w))));
        if (hit(x.title)) score += 3; else if (hit(x.words)) score += 2;
      });
      for (let i = 0; i < toks.length - 1; i++) if (x.full.includes(toks[i] + ' ' + toks[i + 1])) score += 3;
      return { t: x.t, score };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
    if (!res.length) return [];
    const top = res[0].score; return res.filter(r => r.score >= Math.max(2, top * 0.45)).slice(0, 6).map(r => r.t);
  }
  window.v45HelpSearch = search;

  /* ---------------- pictures ---------------- */
  function mock(spec) {
    const i = spec.indexOf(':'); const kind = spec.slice(0, i), txt = E(spec.slice(i + 1));
    if (kind === 'nav') return `<span class="v45-m v45-m-nav">${txt}</span>`;
    if (kind === 'b') return `<span class="v45-m v45-m-b">${txt}</span>`;
    if (kind === 'w') return `<span class="v45-m v45-m-w">${txt}</span>`;
    if (kind === 'i') return `<span class="v45-m v45-m-i">${txt}<i class="v45-caret"></i></span>`;
    if (kind === 'k') return `<span class="v45-m v45-m-k">${txt}</span>`;
    if (kind === 'c') return `<span class="v45-m v45-m-c">${txt}</span>`;
    if (kind === 'y') return `<span class="v45-m v45-m-y">${txt}</span>`;
    return `<span class="v45-m">${txt}</span>`;
  }
  function map(at) {
    if (at === 'key') return `<div class="v45-map v45-map-key" aria-hidden="true">⌨️</div>`;
    if (at === 'scan') return `<div class="v45-map v45-map-key" aria-hidden="true">📟</div>`;
    return `<div class="v45-map" aria-hidden="true"><i class="m-side ${at === 'side' ? 'on' : ''}"></i><i class="m-top ${at === 'top' ? 'on' : ''}"></i><i class="m-main ${at === 'main' ? 'on' : ''}"></i><i class="m-right ${at === 'right' ? 'on' : ''}"></i>${at === 'pop' ? '<i class="m-pop on"></i>' : ''}</div>`;
  }

  /* ---------------- panel ---------------- */
  let P = { open: false, q: '', topic: null };
  const topicById = id => TOPICS.find(t => t.id === id);
  function currentScreen() { try { if (!state.session || !state.session.loggedIn) return 'login'; return state.posNav || 'counter'; } catch (_) { return 'counter'; } }
  function card(t) { return `<button class="v45-card" onclick="v45Help.topic('${t.id}')"><span class="v45-card-ic">${t.ic}</span><span>${E(t.t[L()])}</span>${hasVideo(t.id) ? '<em class="v45-vbadge">▶ video</em>' : ''}<b>›</b></button>`; }
  function vcard(t) { return `<button class="v45-vcard" onclick="v45Help.topic('${t.id}',true)"><span class="v45-vplay">▶</span><span class="v45-card-ic">${t.ic}</span><span>${E(t.t[L()])}</span></button>`; }
  function homeHTML() {
    const q = P.q.trim();
    if (q) {
      const r = search(q);
      return r.length ? `<div class="v45-list">${r.map(card).join('')}</div>` : `<div class="v45-none">🤔 ${tx('none')}</div><div class="v45-list">${['pickup', 'dropdry', 'print', 'manager'].map(id => card(topicById(id))).join('')}</div>`;
    }
    const here = (SCREEN[currentScreen()] || []).map(topicById).filter(Boolean);
    return (here.length ? `<h4 class="v45-h">📍 ${tx('onscreen')}</h4><div class="v45-list">${here.map(card).join('')}</div>` : '') +
      `<h4 class="v45-h">🎬 ${tx('videos')}</h4><div class="v45-vgrid">${VIDEOS.map(topicById).filter(Boolean).map(vcard).join('')}</div>` +
      `<h4 class="v45-h">🎓 ${tx('training')}</h4><div class="v45-vgrid v45-lgrid">${TOPICS.filter(t => t.learn && !t.level).map(vcard).join('')}</div>` +
      `<h4 class="v45-h">🏅 ${tx('training2')}</h4><div class="v45-vgrid v45-lgrid v45-l2">${TOPICS.filter(t => t.learn && t.level === 2).map(vcard).join('')}</div>` +
      `<h4 class="v45-h">📚 ${tx('all')}</h4>` + CATS.filter(c => c[0] !== 'learn').map(([id, ic, en, es]) => `<details class="v45-cat" ${id === 'drop' || id === 'pick' ? 'open' : ''}><summary><span>${ic}</span>${E(L() ? es : en)}<small>${TOPICS.filter(t => t.cat === id).length}</small></summary><div class="v45-list">${TOPICS.filter(t => t.cat === id).map(card).join('')}</div></details>`).join('') +
      `<div class="v45-ask">📞 ${tx('ask')}<br><small>${tx('tip')}</small></div>`;
  }
  function learnHTML(t) {
    return `<div class="v45-topic"><button class="v45-back" onclick="v45Help.home()">${tx('back')}</button>
      <h3 class="v45-tt"><span>${t.ic}</span>${E(t.t[L()])}</h3>
      <div class="v45-video" id="v45-video">${videoHTML(t.id)}</div>
      <div class="v45-actions"><button class="v45-read" id="v45-voice" onclick="v45Help.voice()">${VOICE.on ? tx('voiceon') : tx('voiceoff')}</button><button class="v45-read" id="v45-read" onclick="v45Help.read('${t.id}')">${tx('read')}</button></div>
      <h4 class="v45-h">✅ ${tx('keypts')}</h4><ul class="v45-pts">${t.pts.map(p => `<li>${E(p)}</li>`).join('')}</ul>
      <p class="v45-credit">Narration voice: LibriTTS (CC BY 4.0), made with Piper text-to-speech.</p>
      <div class="v45-ask">📞 ${tx('ask')}</div></div>`;
  }
  function topicHTML(t) {
    if (t.learn) return learnHTML(t);
    return `<div class="v45-topic"><button class="v45-back" onclick="v45Help.home()">${tx('back')}</button>
      <h3 class="v45-tt"><span>${t.ic}</span>${E(t.t[L()])}</h3>
      ${hasVideo(t.id) ? `<div class="v45-video" id="v45-video" ${P.video ? '' : 'hidden'}>${P.video ? videoHTML(t.id) : ''}</div>` : ''}
      <div class="v45-actions">${hasVideo(t.id) ? `<button class="v45-watch" id="v45-watch" onclick="v45Help.video('${t.id}')">${P.video ? tx('hidevid') : tx('watch')}</button>` : ''}<button class="v45-show" onclick="v45Help.tour('${t.id}')">${tx('showme')}</button><button class="v45-read" id="v45-read" onclick="v45Help.read('${t.id}')">${tx('read')}</button></div>
      <ol class="v45-steps">${t.s.map((s, i) => `<li class="v45-step"><div class="v45-num">${i + 1}</div><div class="v45-body"><p>${E(s[2][L()])}</p>${s[3] && s[3].length ? `<div class="v45-mocks">${s[3].map(mock).join('<span class="v45-arrow">→</span>')}</div>` : ''}</div><div class="v45-where">${map(s[0])}<small>${E(UI_T.where[s[0]][L()])}</small></div></li>`).join('')}</ol>
      <button class="v45-show v45-show-bottom" onclick="v45Help.tour('${t.id}')">${tx('showme')}</button>
      <div class="v45-ask">📞 ${tx('ask')}</div></div>`;
  }
  /* training videos have narration recorded into the file; the Voice button just mutes/unmutes it */
  const VOICE = { on: (() => { try { return localStorage.getItem('v45voice') !== 'off'; } catch (_) { return true; } })() };
  function wireVoice(id) {
    const vid = document.querySelector('#v45-video video'); if (!vid || !/^learn/.test(id)) return;
    vid.muted = !VOICE.on; vid.volume = 1;
    const p = vid.play && vid.play(); if (p && p.catch) p.catch(() => {}); // if the browser blocks autoplay, the ▶ button still works
  }
  function videoHTML(id) {
    return `<video src="${videoSrc(id)}" controls autoplay playsinline preload="auto"></video>${L() ? `<small>${tx('vidnote')}</small>` : ''}`;
  }
  function render() {
    let el = document.getElementById('v45-help');
    if (!P.open) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'v45-help'; el.className = 'v45-overlay'; el.addEventListener('click', e => { if (e.target === el) api.close(); }); document.body.appendChild(el); }
    const t = P.topic && topicById(P.topic);
    el.innerHTML = `<div class="v45-panel" role="dialog" aria-label="Help">
      <div class="v45-head"><span class="v45-logo">❓</span><strong>${tx('title')}</strong>
        <span class="v45-lang"><button class="${L() ? '' : 'on'}" onclick="v45Help.lang('en')">EN</button><button class="${L() ? 'on' : ''}" onclick="v45Help.lang('es')">ES</button></span>
        <button class="v45-x" onclick="v45Help.close()" aria-label="${tx('close')}">✕</button></div>
      ${t ? '' : `<div class="v45-search"><span>🔎</span><input id="v45-q" type="text" autocomplete="off" placeholder="${E(tx('ph'))}" value="${E(P.q)}" oninput="v45Help.q(this.value)"></div>`}
      <div class="v45-scroll" id="v45-scroll">${t ? topicHTML(t) : homeHTML()}</div></div>`;
    if (!t) { const i = document.getElementById('v45-q'); if (i && document.activeElement !== i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  function refreshResults() { const sc = document.getElementById('v45-scroll'); if (sc && !P.topic) sc.innerHTML = homeHTML(); }

  /* ---------------- read aloud ---------------- */
  function stopSpeak() { try { speechSynthesis.cancel(); } catch (_) {} }
  function speak(t) {
    const btn = document.getElementById('v45-read');
    try {
      if (speechSynthesis.speaking) { stopSpeak(); if (btn) btn.textContent = tx('read'); return; }
      const lang = L() ? 'es-US' : 'en-US';
      const parts = t.learn ? [t.t[L()]].concat(t.pts) : [t.t[L()]].concat(t.s.map((s, i) => `${tx('step')} ${i + 1}. ${s[2][L()]}`));
      parts.forEach((p, i) => { const u = new SpeechSynthesisUtterance(p); u.lang = lang; u.rate = 0.9; if (i === parts.length - 1) u.onend = () => { const b = document.getElementById('v45-read'); if (b) b.textContent = tx('read'); }; speechSynthesis.speak(u); });
      if (btn) btn.textContent = tx('stop');
    } catch (_) { if (window.toast) toast('Read aloud is not available on this device', false); }
  }

  /* ---------------- "Show me" tour ---------------- */
  let T = null;
  function visible(el) { if (!el || !el.getClientRects().length) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
  function findTarget(sel) {
    if (!sel) return null;
    let list = []; try { list = [...document.querySelectorAll(sel)]; } catch (_) { return null; }
    list = list.filter(el => !el.closest('#v45-help, .v45-tour') && visible(el));
    const modal = document.querySelector('.pos-modal-overlay.show');
    if (modal) { const inModal = list.filter(el => modal.contains(el)); if (inModal.length) return inModal[0]; }
    return list[0] || null;
  }
  function tourUI() {
    let w = document.getElementById('v45-tour');
    if (!w) { w = document.createElement('div'); w.id = 'v45-tour'; w.className = 'v45-tour'; w.innerHTML = '<div class="v45-dim"></div><div class="v45-ring"></div><div class="v45-hand">👆</div><div class="v45-bubble"></div>'; document.body.appendChild(w); }
    return w;
  }
  function tourStep() {
    if (!T) return;
    const t = T.topic, s = t.s[T.i], w = tourUI(), b = w.querySelector('.v45-bubble');
    T.el = null; T.scrolled = false;
    const isInput = !!s[1] && /input|textarea|#v44-(cq|type)|#v3-conveyor|rack-input|#v43-amt/.test(s[1]) && !/checkbox/.test(s[1]);
    b.innerHTML = `<div class="v45-b-top"><span class="v45-b-num">${T.i + 1}</span><small>${tx('step')} ${T.i + 1} ${tx('of')} ${t.s.length} · ${E(t.t[L()])}</small></div>
      <p>${E(s[2][L()])}</p>${s[3] && s[3].length ? `<div class="v45-mocks">${s[3].map(mock).join('<span class="v45-arrow">→</span>')}</div>` : ''}
      <div class="v45-b-hint" id="v45-hint">${s[1] ? (isInput ? tx('typeit') : tx('tapit')) : ''}</div>
      <div class="v45-b-btns"><button class="v45-b-quit" onclick="v45Help.endTour()">${tx('quit')}</button>${T.i ? `<button onclick="v45Help.step(-1)">${tx('prev')}</button>` : ''}<button class="v45-b-next" onclick="v45Help.step(1)">${T.i === t.s.length - 1 ? tx('done') : tx('next')}</button></div>`;
    T.input = isInput;
    place();
  }
  function place() {
    if (!T) return;
    const w = document.getElementById('v45-tour'); if (!w) return;
    const s = T.topic.s[T.i], ring = w.querySelector('.v45-ring'), hand = w.querySelector('.v45-hand'), b = w.querySelector('.v45-bubble'), dim = w.querySelector('.v45-dim');
    const el = findTarget(s[1]);
    if (el && !T.scrolled) { T.scrolled = true; try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {} }
    T.el = el;
    const hint = document.getElementById('v45-hint');
    if (!el) {
      ring.style.display = 'none'; hand.style.display = 'none';
      const pm = document.querySelector('.pos-modal-overlay.show .pos-modal, .pos-modal-overlay.show > div');
      const pr = pm && pm.getBoundingClientRect();
      if (pr && pr.width) { // a pop-up is open: sit beside it, never on top of it
        dim.style.display = 'none'; b.classList.remove('v45-b-center');
        const bw = Math.min(420, innerWidth - 24); b.style.width = bw + 'px'; const bh = b.offsetHeight || 240;
        const left = pr.right + 18 + bw <= innerWidth - 12 ? pr.right + 18 : pr.left - bw - 18 >= 12 ? pr.left - bw - 18 : innerWidth - bw - 12;
        const top = Math.max(12, Math.min(pr.top, innerHeight - bh - 12));
        b.style.left = left + 'px'; b.style.top = top + 'px';
      } else { dim.style.display = 'block'; b.classList.add('v45-b-center'); b.style.left = b.style.top = ''; }
      if (hint && s[1]) hint.textContent = tx('notyet');
      return;
    }
    if (hint) hint.textContent = T.input ? tx('typeit') : tx('tapit');
    dim.style.display = 'none'; b.classList.remove('v45-b-center');
    const r = el.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { display: 'block', left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
    Object.assign(hand.style, { display: 'block', left: (r.left + Math.min(r.width / 2, 60) - 18) + 'px', top: (r.bottom + 4) + 'px' });
    const bw = Math.min(440, innerWidth - 24); b.style.width = bw + 'px'; const bh = b.offsetHeight || 240, M = 14;
    // keep clear of the target — and of the space under a typing box, where search results pop up
    const zone = { l: r.left - 10, t: r.top - 10, r: r.right + 10, b: r.bottom + (T.input ? 300 : 70) };
    const hits = (x, y) => !(x + bw < zone.l || x > zone.r || y + bh < zone.t || y > zone.b);
    const fits = (x, y) => x >= M && y >= M && x + bw <= innerWidth - M && y + bh <= innerHeight - M;
    const cx = Math.max(M, Math.min(r.left + r.width / 2 - bw / 2, innerWidth - bw - M));
    const spots = [[cx, zone.b + 6], [cx, r.top - bh - 20], [r.right + 24, Math.max(M, r.top)], [r.left - bw - 24, Math.max(M, r.top)],
      [innerWidth - bw - M, innerHeight - bh - M], [M, innerHeight - bh - M], [innerWidth - bw - M, M]];
    let spot = spots.find(([x, y]) => fits(x, y) && !hits(x, y)) || spots.find(([x, y]) => fits(x, y)) || [M, M];
    const left = spot[0], top = spot[1];
    Object.assign(b.style, { left: left + 'px', top: top + 'px', width: bw + 'px' });
  }
  function onClick(e) {
    if (!T || !e.target.closest || e.target.closest('.v45-tour')) return;
    const at = T.i, nx = T.topic.s[at + 1];
    // they already did the next step too (e.g. typed a name, then tapped it) → skip ahead
    if (nx && nx[1]) { try { if (e.target.closest(nx[1])) { setTimeout(() => { if (T && T.i === at) { T.i = at + 1; api.step(1); } }, 450); return; } } catch (_) {} }
    if (!T.el || T.input) return;
    // any button of the right kind counts (e.g. "Wool" when "Standard" is the one glowing)
    let ok = T.el.contains(e.target); if (!ok) { try { ok = !!e.target.closest(T.topic.s[at][1]); } catch (_) {} }
    if (ok) setTimeout(() => { if (T && T.i === at) api.step(1); }, 450);
  }
  function onKey(e) {
    if (e.key === 'F1') { e.preventDefault(); api.open(); return; }
    if (T && e.key === 'Escape') { api.endTour(); return; }
    if (T && T.input && e.key === 'Enter' && T.el && (T.el === e.target || T.el.contains(e.target))) { const at = T.i; setTimeout(() => { if (T && T.i === at) api.step(1); }, 500); }
    if (!T && P.open && e.key === 'Escape') api.close();
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', () => place());
  window.addEventListener('scroll', () => place(), true);

  /* ---------------- public api ---------------- */
  const api = {
    open(q) { P.open = true; P.topic = null; if (typeof q === 'string') P.q = q; render(); },
    close() { P.open = false; P.video = false; stopSpeak(); render(); },
    home() { P.topic = null; P.video = false; stopSpeak(); render(); },
    video(id) {
      P.video = !P.video; const box = document.getElementById('v45-video'), btn = document.getElementById('v45-watch'); if (!box) return;
      if (P.video) { stopSpeak(); box.innerHTML = videoHTML(id); box.hidden = false; box.scrollIntoView({ block: 'nearest' }); }
      else { box.innerHTML = ''; box.hidden = true; }
      if (btn) btn.textContent = P.video ? tx('hidevid') : tx('watch');
    },
    topic(id, play) { P.topic = id; P.video = !!(play && hasVideo(id)); stopSpeak(); render(); const sc = document.getElementById('v45-scroll'); if (sc) sc.scrollTop = 0; wireVoice(id); },
    voice() { VOICE.on = !VOICE.on; try { localStorage.setItem('v45voice', VOICE.on ? 'on' : 'off'); } catch (_) {} const vid = document.querySelector('#v45-video video'); if (vid) vid.muted = !VOICE.on; const b = document.getElementById('v45-voice'); if (b) b.textContent = VOICE.on ? tx('voiceon') : tx('voiceoff'); },
    q(v) { P.q = v; refreshResults(); },
    lang(l) { HL = l; stopSpeak(); render(); },
    read(id) { const t = topicById(id); if (t) speak(t); },
    tour(id) {
      const t = topicById(id); if (!t) return;
      P.open = false; P.video = false; stopSpeak(); render();
      T = { topic: t, i: 0 }; tourStep();
      clearInterval(api._timer); api._timer = setInterval(place, 350);
    },
    step(d) {
      if (!T) return; const n = T.i + d;
      if (n >= T.topic.s.length) { api.endTour(true); return; }
      T.i = Math.max(0, n); tourStep();
    },
    endTour(finished) {
      const id = T && T.topic.id; T = null; clearInterval(api._timer);
      const w = document.getElementById('v45-tour'); if (w) w.remove();
      if (finished && window.toast) toast(tx('finished'), true);
      else if (id) { P.open = true; P.topic = id; render(); }
    },
    topics: TOPICS
  };
  window.v45Help = api;

  /* ---------------- buttons: top bar + sidebar ---------------- */
  function ensureButton() {
    const bell = document.querySelector('button[onclick^="v38ToggleAlerts"]');
    let btn = document.getElementById('v45-help-btn');
    if (bell && bell.parentElement) {
      if (!btn || btn.nextElementSibling !== bell) { if (btn) btn.remove(); btn = document.createElement('button'); btn.id = 'v45-help-btn'; btn.type = 'button'; btn.className = 'v45-help-btn'; btn.onclick = () => api.open(); bell.parentElement.insertBefore(btn, bell); }
      btn.classList.remove('v45-float');
    } else {
      if (!btn) { btn = document.createElement('button'); btn.id = 'v45-help-btn'; btn.type = 'button'; btn.onclick = () => api.open(); document.body.appendChild(btn); }
      if (btn.parentElement !== document.body) document.body.appendChild(btn);
      btn.className = 'v45-help-btn v45-float';
    }
    const label = `❓ ${tx('help')}`; if (btn.textContent !== label) btn.textContent = label;
  }
  try {
    if (typeof POS_NAV_ITEMS !== 'undefined' && !POS_NAV_ITEMS.some(n => n.id === 'help')) POS_NAV_ITEMS.push({ id: 'help', label: 'Help', icon: 'help' });
    if (typeof V13_I18N !== 'undefined') { Object.assign(V13_I18N.en, { 'nav.help': 'Help' }); if (V13_I18N.es) Object.assign(V13_I18N.es, { 'nav.help': 'Ayuda' }); }
  } catch (_) {}
  // "Help" in the sidebar opens the guide on top of whatever screen you are on.
  const baseGo = window.posGoTo;
  if (typeof baseGo === 'function') {
    const go = function v45PosGoTo(nav) { if (nav === 'help') { api.open(); return; } return baseGo.apply(this, arguments); };
    window.posGoTo = go; try { posGoTo = go; } catch (_) {}
  }
  const baseRender = window.renderPosContent;
  if (typeof baseRender === 'function') {
    const r = function v45RenderPosContent() { const out = baseRender.apply(this, arguments); try { ensureButton(); } catch (_) {} return out; };
    window.renderPosContent = r; try { renderPosContent = r; } catch (_) {}
  }
  setInterval(() => { try { ensureButton(); } catch (_) {} }, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureButton); else ensureButton();
})();
