export const STEPS = [
  { title: 'Choose your van', text: 'Pick Ljubljana or Bled, shared or private, and the departure that suits you. You see exactly how many seats are left.' },
  { title: 'Pay with Revolut', text: 'Card, Apple Pay or Google Pay. No account needed — just your email for the ticket and the invoice.' },
  { title: 'Find your van by its plate', text: 'Your ticket shows the licence plate and where the vans are parked. Tell the driver your address in Ljubljana or Bled.' },
];

export const FAQ = [
  { q: 'Where do you drop me off?', a: 'Anywhere in Ljubljana or Bled — just tell the driver your address when you board. No need to enter it online.' },
  { q: 'Shared or private — what is the difference?', a: 'Shared: you pay per seat and share the van with other travellers. Private: the whole van is yours, for one price, even if you travel alone.' },
  { q: 'Is there a discount for groups?', a: 'Yes. Book several seats together on a shared ride and a group discount is applied automatically — you see it in the price before you pay.' },
  { q: 'Where do I meet the van?', a: 'Your ticket includes a map of the GoOpti van bay just outside arrivals, and the licence plate of your van.' },
  { q: 'What if my flight is late?', a: 'Come to the GoOpti desk in arrivals. We will do our best to put you on the next van with free seats.' },
  { q: 'Do I get an invoice?', a: 'Yes. After payment you receive your ticket and, in a separate email, the invoice issued by Markun Borut d.o.o. You can add company details for a business invoice.' },
];

export const ROUTE_CARDS = [
  { code: 'LJU-LJ' as const, kicker: 'City', name: 'Ljubljana', desc: 'Any address in Ljubljana — hotel, apartment, bus or train station. Tell the driver when you board.' },
  { code: 'LJU-BLED' as const, kicker: 'Lake', name: 'Bled', desc: 'Any address in Bled — hotels, villas and guesthouses around the lake. Tell the driver when you board.' },
];
