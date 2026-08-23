/**
 * Seed content for the club website.
 *
 * This is what visitors see before an administrator has entered anything, and
 * what keeps the site readable if the backend is briefly unavailable. Every
 * item here is replaced the moment the API answers with real rows.
 */

export const FALLBACK = {
  site: {
    organizationName: 'Krishnanagar Youth & Cultural Club',
    shortName: 'KYCC',
    slogan: 'Service · Culture · Community',
    establishedYear: 1978,
    registrationNo: 'S/1L/12345 of 1978-79',
    addressLine: '14, Rabindra Sarani, Krishnanagar, Nadia — 741101, West Bengal',
    phone: '+91 33 2555 0100',
    email: 'office@example.org',
    officeHours: 'Monday to Saturday, 10:00 — 17:00 (closed on public holidays)',
  },

  statistics: [
    { id: 1, label: 'Registered members', value: 1240, suffix: '+' },
    { id: 2, label: 'Programmes each year', value: 65, suffix: '+' },
    { id: 3, label: 'Wards covered', value: 24, suffix: '' },
    { id: 4, label: 'Years of service', value: 47, suffix: '' },
  ],

  notices: [
    { id: 1, title: 'Annual General Meeting — 12 September, 11:00 at the club hall',
      publishedAt: '2026-08-18', url: '/news' },
    { id: 2, title: 'Membership renewal for 2026-27 is open until 30 September',
      publishedAt: '2026-08-12', url: '/membership' },
    { id: 3, title: 'Blood donation camp: registrations close 5 September',
      publishedAt: '2026-08-05', url: '/events' },
  ],

  events: [
    { id: 1, slug: 'annual-cultural-festival-2026', title: 'Annual Cultural Festival 2026',
      category: 'Cultural', start: '2026-09-21T17:00:00', end: '2026-09-23T21:00:00',
      venue: 'Club Grounds, Rabindra Sarani',
      summary: 'Three evenings of music, recitation and drama presented by members of all ages, '
             + 'closing with the prize distribution ceremony.',
      image: null, registrationOpen: true },
    { id: 2, slug: 'blood-donation-camp-september', title: 'Blood Donation Camp',
      category: 'Social service', start: '2026-09-07T09:00:00', end: '2026-09-07T14:00:00',
      venue: 'Community Hall, Ward 14',
      summary: 'Held with the district blood bank. Donors should carry a photo identity card '
             + 'and eat before arriving.',
      image: null, registrationOpen: true },
    { id: 3, slug: 'inter-ward-football-tournament', title: 'Inter-Ward Football Tournament',
      category: 'Sports', start: '2026-10-02T08:00:00', end: '2026-10-09T18:00:00',
      venue: 'Municipal Stadium',
      summary: 'Sixteen ward teams compete over eight days. Team entries are accepted at the '
             + 'club office until 25 September.',
      image: null, registrationOpen: true },
    { id: 4, slug: 'free-health-check-up-drive', title: 'Free Health Check-up Drive',
      category: 'Health', start: '2026-07-19T09:00:00', end: '2026-07-19T15:00:00',
      venue: 'Club Premises',
      summary: 'General physician, eye and blood-sugar screening, held with the district hospital.',
      image: null, registrationOpen: false },
  ],

  activities: [
    { id: 1, title: 'Social service', icon: '🤝',
      description: 'Blood donation camps, relief distribution and support for families affected '
                 + 'by flood or fire in the ward.' },
    { id: 2, title: 'Sports', icon: '⚽',
      description: 'Football, cricket and athletics for young people, including a coaching camp '
                 + 'each summer.' },
    { id: 3, title: 'Culture', icon: '🎭',
      description: 'Recitation, drama, folk music and the annual Durga Puja cultural programme.' },
    { id: 4, title: 'Education', icon: '📚',
      description: 'A free evening study centre, a lending library and scholarships for two '
                 + 'students each year.' },
    { id: 5, title: 'Health', icon: '🩺',
      description: 'Check-up drives, awareness sessions on public health and an ambulance '
                 + 'referral service.' },
    { id: 6, title: 'Environment', icon: '🌳',
      description: 'Tree planting along ward roads, pond cleaning and a plastic-free market '
                 + 'campaign.' },
  ],

  articles: [
    { id: 1, slug: 'club-wins-district-award', title: 'Club receives district award for social service',
      category: 'Announcement', publishedAt: '2026-08-14',
      excerpt: 'The district administration recognised the club for its relief work during the '
             + 'monsoon, presented at the collectorate on Independence Day.', image: null },
    { id: 2, slug: 'new-study-centre-opens', title: 'New evening study centre opens for ward students',
      category: 'Education', publishedAt: '2026-07-30',
      excerpt: 'Forty students of classes VIII to XII now attend free evening classes in the '
             + 'club reading room, staffed by volunteer teachers.', image: null },
    { id: 3, slug: 'monsoon-relief-report', title: 'Monsoon relief: what the club distributed',
      category: 'Report', publishedAt: '2026-07-11',
      excerpt: 'A full account of relief material distributed across four wards, with the list '
             + 'of contributors published for public inspection.', image: null },
  ],

  gallery: [
    { id: 1, title: 'Cultural evening, 2025', category: 'Cultural', mediaType: 'image',
      caption: 'Members performing at the annual cultural evening.', takenOn: '2025-09-22', image: null },
    { id: 2, title: 'Blood donation camp', category: 'Social service', mediaType: 'image',
      caption: 'The ninth blood donation camp held at the club premises.', takenOn: '2025-08-14', image: null },
    { id: 3, title: 'Football final', category: 'Sports', mediaType: 'image',
      caption: 'The inter-ward football final at the municipal stadium.', takenOn: '2025-10-09', image: null },
    { id: 4, title: 'Tree planting drive', category: 'Environment', mediaType: 'image',
      caption: 'Two hundred saplings planted along the ward roads.', takenOn: '2025-06-05', image: null },
    { id: 5, title: 'Study centre', category: 'Education', mediaType: 'image',
      caption: 'Evening classes in the club reading room.', takenOn: '2025-07-30', image: null },
    { id: 6, title: 'Health check-up', category: 'Health', mediaType: 'image',
      caption: 'Free eye screening with the district hospital.', takenOn: '2025-07-19', image: null },
  ],

  team: [
    { id: 1, name: 'Sri Anup Kumar Ghosh', slug: 'anup-kumar-ghosh', position: 'President',
      category: 'Executive committee', tenure: '2024 — 2027', photo: null,
      bio: 'A founding trustee of the study centre, associated with the club since 1994.' },
    { id: 2, name: 'Smt. Ratna Bhattacharya', slug: 'ratna-bhattacharya', position: 'Vice President',
      category: 'Executive committee', tenure: '2024 — 2027', photo: null,
      bio: 'Leads the cultural wing and the annual festival organising team.' },
    { id: 3, name: 'Sri Debashis Roy', slug: 'debashis-roy', position: 'General Secretary',
      category: 'Executive committee', tenure: '2024 — 2027', photo: null,
      bio: 'Handles correspondence with the municipality and the district administration.' },
    { id: 4, name: 'Sri Prasenjit Das', slug: 'prasenjit-das', position: 'Treasurer',
      category: 'Executive committee', tenure: '2024 — 2027', photo: null,
      bio: 'Maintains the accounts, which are audited and published each financial year.' },
    { id: 5, name: 'Smt. Sumita Kar', slug: 'sumita-kar', position: 'Cultural Secretary',
      category: 'Office bearers', tenure: '2024 — 2027', photo: null,
      bio: 'Coordinates recitation, drama and music training for members.' },
    { id: 6, name: 'Sri Rahul Mondal', slug: 'rahul-mondal', position: 'Sports Secretary',
      category: 'Office bearers', tenure: '2024 — 2027', photo: null,
      bio: 'Runs the football and athletics programmes and the summer coaching camp.' },
  ],

  resources: [
    { id: 1, title: 'Club constitution and bye-laws', category: 'Governance',
      updatedOn: '2025-04-01', size: 'PDF · 412 KB', href: null },
    { id: 2, title: 'Membership application form', category: 'Forms',
      updatedOn: '2026-04-10', size: 'PDF · 96 KB', href: null },
    { id: 3, title: 'Audited accounts, 2024-25', category: 'Accounts',
      updatedOn: '2025-09-30', size: 'PDF · 1.1 MB', href: null },
    { id: 4, title: 'Annual report, 2024-25', category: 'Reports',
      updatedOn: '2025-09-30', size: 'PDF · 2.4 MB', href: null },
    { id: 5, title: 'Event participation certificate format', category: 'Forms',
      updatedOn: '2025-11-02', size: 'PDF · 78 KB', href: null },
  ],

  values: [
    { id: 1, title: 'Service before self',
      description: 'Every programme is judged by what it does for the neighbourhood, not by how '
                 + 'it looks in a photograph.' },
    { id: 2, title: 'Open accounts',
      description: 'Audited accounts and the annual report are published each year and are open '
                 + 'to inspection by any member.' },
    { id: 3, title: 'Equal participation',
      description: 'Membership and every programme are open regardless of gender, faith or means.' },
    { id: 4, title: 'Answerable office',
      description: 'Office bearers are elected by the general body and serve a fixed three-year term.' },
  ],

  milestones: [
    { id: 1, year: '1978', title: 'The club is founded',
      description: 'Registered under the West Bengal Societies Registration Act by twenty-two residents.' },
    { id: 2, year: '1992', title: 'Permanent premises',
      description: 'The club hall on Rabindra Sarani is completed with member contributions.' },
    { id: 3, year: '2006', title: 'Study centre opens',
      description: 'Free evening classes begin for students of the ward.' },
    { id: 4, year: '2019', title: 'District award',
      description: 'Recognised by the district administration for disaster relief work.' },
    { id: 5, year: '2026', title: 'Online services',
      description: 'Membership, event registration and public documents move online.' },
  ],
};
