"""Populate the site with realistic sample content.

Run with ``python manage.py seed_demo`` (add ``--reset`` to wipe the existing
club content first). Everything created here is ordinary editable content —
replace it from the admin console with your own organisation's details.
"""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from club.models import (Achievement, Activity, Announcement, Article, Category,
                         Certificate, CoreValue, Event, EventRegistration,
                         GalleryItem, Interest, MemberProfile,
                         MembershipApplication, MembershipBenefit, Milestone,
                         Resource, SiteSettings, Statistic, TeamMember,
                         Testimonial)

ORG = 'Sunrise Youth Club & Cultural Association'


class Command(BaseCommand):
    help = 'Load demonstration content for the club website.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true',
                            help='Delete existing club content before seeding.')

    def handle(self, *args, **options):
        if options['reset']:
            for model in (EventRegistration, Event, Article, GalleryItem, TeamMember,
                          Activity, Resource, Announcement, MembershipBenefit,
                          MembershipApplication, Certificate, Testimonial, Statistic,
                          Milestone, Achievement, CoreValue, Interest, Category):
                model.objects.all().delete()
            SiteSettings.objects.all().delete()
            self.stdout.write('Existing club content removed.')

        self.seed_settings()
        categories = self.seed_categories()
        self.seed_about()
        self.seed_activities(categories)
        events = self.seed_events(categories)
        self.seed_news(categories)
        self.seed_gallery(categories, events)
        self.seed_team(categories)
        self.seed_resources(categories)
        self.seed_membership()
        self.seed_announcements(events)
        self.seed_members(events)
        self.stdout.write(self.style.SUCCESS(
            'Demo content ready. Sign in at /login/ as member/member12345 or at '
            '/admin/ as admin/admin.'))

    # ------------------------------------------------------------------ site
    def seed_settings(self):
        settings_obj = SiteSettings.load()
        settings_obj.organization_name = ORG
        settings_obj.short_name = 'SYCCA'
        settings_obj.parent_authority = ('Affiliated to the District Youth Welfare Board · '
                                         'A registered non-profit society')
        settings_obj.registration_line = ('Registered under the Societies Registration Act — '
                                          'Reg. No. S/IV-2412 of 2004')
        settings_obj.slogan = 'Service before self · Learning through participation'
        settings_obj.established = 2004
        settings_obj.introduction = (
            'The Sunrise Youth Club & Cultural Association is a registered voluntary '
            'organisation working with young people across eleven wards. We run a free '
            'community library, sports coaching, skill-development workshops, health camps '
            'and cultural programmes, and we work closely with local schools and the '
            'district administration on youth welfare schemes.')
        settings_obj.history = (
            'The club began in 2004 as a reading circle of fourteen students who met under '
            'the banyan tree beside the ward office. A one-room library came first, then '
            'evening coaching for children whose parents worked shifts, then a football '
            'team that had to borrow boots for its first match.\n\n'
            'Two decades later the organisation runs from a purpose-built community centre '
            'with a reading room of over four thousand titles, an indoor games hall and a '
            'training room used for skill-development courses. More than five hundred '
            'members carry the work forward, and the annual cultural festival now draws '
            'participants from neighbouring districts.\n\n'
            'What has not changed is the method: everything is planned, funded and run by '
            'members themselves, and every rupee received is placed before the general body '
            'in the annual report.')
        settings_obj.mission = (
            'To create structured opportunities for young people to learn, serve and lead — '
            'through education support, sport, culture and community service delivered '
            'without cost to those who need it most.')
        settings_obj.vision = (
            'A neighbourhood where every young person has a safe place to study, a team to '
            'play for, a skill to earn with and a cause to serve.')
        settings_obj.objectives = (
            'To maintain a free community library and reading room for students of all ages.\n'
            'To organise sports coaching, tournaments and physical fitness programmes.\n'
            'To conduct skill-development and career-guidance workshops for youth.\n'
            'To promote local art, music, theatre and literature through cultural programmes.\n'
            'To undertake community service including blood donation, health camps and '
            'disaster relief.\n'
            'To cooperate with government departments and local bodies in youth welfare schemes.')
        settings_obj.address = ('Community Centre, 42 Nabin Sangha Road\nWard No. 12, '
                                'Krishnanagar\nPIN 741101')
        settings_obj.phone = '+91 98300 00000'
        settings_obj.alt_phone = '+91 33 2555 0000'
        settings_obj.email = 'office@sunriseyouthclub.example'
        settings_obj.office_hours = 'Monday to Saturday, 10:00 AM – 6:00 PM (closed on public holidays)'
        settings_obj.latitude = 23.4012
        settings_obj.longitude = 88.5012
        settings_obj.facebook = 'https://www.facebook.com/'
        settings_obj.instagram = 'https://www.instagram.com/'
        settings_obj.youtube = 'https://www.youtube.com/'
        settings_obj.linkedin = 'https://www.linkedin.com/'
        settings_obj.content_managed_by = 'Office of the General Secretary'
        settings_obj.privacy_policy = (
            'This website is owned and operated by the Sunrise Youth Club & Cultural '
            'Association. This page explains what information we collect and how it is used.\n\n'
            '1. Information you provide. Membership applications, event registrations and '
            'enquiry forms collect your name, contact details and the particulars you enter. '
            'This information is used only to process your request and to communicate with '
            'you about the activities of the organisation.\n\n'
            '2. Information collected automatically. Our server records standard web logs '
            '(page requested, date and time, browser type). These logs are used for site '
            'administration and are not linked to any individual.\n\n'
            '3. Sharing. We do not sell, trade or rent personal information. Details are '
            'shared with government departments only where a scheme requires it, and only '
            'with your knowledge.\n\n'
            '4. Retention and correction. Membership records are retained for as long as '
            'the membership subsists. You may write to the office at any time to inspect or '
            'correct your particulars.\n\n'
            '5. Cookies. This site stores your display preferences (theme, text size, '
            'contrast) in your own browser. No tracking cookies are used.')
        settings_obj.terms_of_use = (
            'Please read these terms before using this website.\n\n'
            '1. Content. The material on this site is published for general information. '
            'While every effort is made to keep it accurate and current, the organisation '
            'does not accept liability for any loss arising from the use of the information.\n\n'
            '2. Registrations. Event registration confirms a seat but does not create a '
            'contractual obligation. The organisation may reschedule or cancel a programme, '
            'and will inform registered participants when it does.\n\n'
            '3. Membership. Membership is granted at the discretion of the executive '
            'committee, in accordance with the rules of the society, and may be withdrawn '
            'for conduct prejudicial to the objects of the organisation.\n\n'
            '4. Copyright. Photographs, reports and documents on this site are the property '
            'of the organisation. They may be reproduced for non-commercial purposes with '
            'due acknowledgement.\n\n'
            '5. External links. Links to other websites are provided for convenience. The '
            'organisation is not responsible for the content of external sites.')
        settings_obj.save()

    def seed_categories(self):
        data = {
            'event': ['Cultural', 'Sports', 'Workshop', 'Community Service', 'Meeting'],
            'news': ['Announcements', 'Achievements', 'Press Note', 'Notices'],
            'gallery': ['Annual Festival', 'Sports Meet', 'Community Camps', 'Workshops'],
            'activity': ['Education', 'Sports & Fitness', 'Culture', 'Community Service'],
            'resource': ['Forms', 'Reports', 'Rules & Regulations', 'Brochures'],
            'team': ['Office Bearers', 'Executive Committee', 'Advisors', 'Coordinators',
                     'Volunteers'],
        }
        created = {}
        for section, names in data.items():
            for order, name in enumerate(names):
                category, _ = Category.objects.get_or_create(
                    section=section, name=name, defaults={'order': order})
                created[f'{section}:{name}'] = category
        return created

    def seed_about(self):
        stats = [('Registered Members', 540, '+'), ('Programmes Held', 260, '+'),
                 ('Projects Completed', 32, '+'), ('Years of Service', 21, '')]
        for order, (label, value, suffix) in enumerate(stats):
            Statistic.objects.get_or_create(label=label,
                                            defaults={'value': value, 'suffix': suffix,
                                                      'order': order})
        values = [
            ('Service', 'Work is chosen by what the neighbourhood needs, not by what is easy '
                        'to publicise.'),
            ('Transparency', 'Accounts, minutes and annual reports are placed before the '
                             'general body and published on this website.'),
            ('Inclusion', 'Every programme is open to all residents irrespective of means, '
                          'gender or ability.'),
            ('Discipline', 'Programmes begin on time, records are maintained, and '
                           'commitments made to members are kept.'),
        ]
        for order, (title, description) in enumerate(values):
            CoreValue.objects.get_or_create(title=title,
                                            defaults={'description': description, 'order': order})

        milestones = [
            ('2004', 'The club is founded', 'Fourteen students form a reading circle and '
                                            'register the society with fifty members.'),
            ('2009', 'Community library opens', 'A one-room library with 600 donated books '
                                                'begins lending to students of the ward.'),
            ('2014', 'Community centre inaugurated', 'The purpose-built centre with a reading '
                                                     'room and indoor games hall is completed.'),
            ('2018', 'Skill-development wing begins', 'Tailoring, computer literacy and spoken '
                                                      'English courses start for youth and women.'),
            ('2022', 'District recognition', 'The club is recognised as a nodal youth '
                                             'organisation for the block.'),
            ('2025', 'Digital services launched', 'Online membership, event registration and '
                                                  'document downloads go live on this portal.'),
        ]
        for order, (year, title, description) in enumerate(milestones):
            Milestone.objects.get_or_create(year=year, title=title,
                                            defaults={'description': description, 'order': order})

        achievements = [
            ('Best Youth Organisation of the Block', '2024', 'District Youth Welfare Board',
             'For sustained work in education support and community health.'),
            ('State Youth Festival — Group Theatre, First Prize', '2023',
             'State Youth Cultural Council', 'Awarded for the production “Alor Pathe”.'),
            ('Certificate of Appreciation — Blood Donation', '2022', 'District Blood Bank',
             'For organising six camps collecting over 900 units.'),
            ('Inter-Club Football Championship, Runners-up', '2021', 'Krishnanagar Sports Association', ''),
        ]
        for order, (title, year, awarded_by, description) in enumerate(achievements):
            Achievement.objects.get_or_create(
                title=title, defaults={'year': year, 'awarded_by': awarded_by,
                                       'description': description, 'order': order})

        testimonials = [
            ('Ananya Sengupta', 'Member since 2019',
             'I came for the library and stayed for everything else. The club gave me my first '
             'stage, my first team and my first real responsibility.'),
            ('Dr. Prabir Mondal', 'Volunteer physician, health camps',
             'In eight years of camps I have never seen a queue mismanaged. The volunteers '
             'here are better organised than many institutions I have worked with.'),
            ('Rehana Khatun', 'Parent',
             'Both my children attend the evening coaching. It costs nothing, and the '
             'difference in their results has been remarkable.'),
        ]
        for order, (name, role, quote) in enumerate(testimonials):
            Testimonial.objects.get_or_create(name=name, defaults={'role': role, 'quote': quote,
                                                                   'order': order})

    def seed_activities(self, categories):
        activities = [
            ('Community Library & Reading Room', 'Education', '📚', 'Open daily',
             'A free lending library of over 4,000 titles with a quiet reading room, '
             'newspapers and competitive-examination material.'),
            ('Evening Coaching Classes', 'Education', '✏️', 'Mon–Fri, 5–7 PM',
             'Free coaching in mathematics, science and English for students of classes V '
             'to X, taught by member volunteers and retired teachers.'),
            ('Career Guidance & Skill Workshops', 'Education', '🎓', 'Monthly',
             'Computer literacy, spoken English, tailoring and interview preparation, '
             'conducted with resource persons from local institutions.'),
            ('Football & Athletics Coaching', 'Sports & Fitness', '⚽', 'Tue, Thu, Sat mornings',
             'Structured coaching for two age groups, with an annual inter-ward tournament '
             'and participation in district-level meets.'),
            ('Yoga & Fitness Sessions', 'Sports & Fitness', '🧘', 'Daily, 6 AM',
             'Open yoga sessions on the community centre terrace, free for all residents.'),
            ('Annual Cultural Festival', 'Culture', '🎭', 'Every December',
             'Three days of theatre, recitation, music and dance with participants from '
             'neighbouring districts.'),
            ('Music & Recitation School', 'Culture', '🎵', 'Weekends',
             'Classes in vocal music, tabla and recitation for children and adults at a '
             'nominal fee.'),
            ('Blood Donation Camps', 'Community Service', '🩸', 'Quarterly',
             'Camps organised with the district blood bank, collecting over 150 units a year.'),
            ('Health & Eye Check-up Camps', 'Community Service', '🏥', 'Twice a year',
             'Free general health, diabetes and eye screening with volunteer physicians.'),
            ('Disaster Relief & Cleanliness Drives', 'Community Service', '🤝', 'As required',
             'Relief collection during floods and storms, and monthly cleanliness drives '
             'along the ward canal.'),
        ]
        for order, (title, category, icon, frequency, description) in enumerate(activities):
            Activity.objects.get_or_create(
                title=title,
                defaults={'category': categories.get(f'activity:{category}'), 'icon': icon,
                          'frequency': frequency, 'description': description,
                          'summary': description[:140], 'order': order})

    def seed_events(self, categories):
        today = timezone.localtime()
        specs = [
            (7, 'Annual Sports Meet 2026', 'Sports', 'Municipal Stadium Ground',
             'Track and field events for four age groups, followed by the prize distribution '
             'ceremony. Entries close three days before the meet. Participants must report '
             'ninety minutes before their event with a photo identity card.', 300, True),
            (14, 'Free Health & Eye Check-up Camp', 'Community Service', 'Community Centre Hall',
             'General physician consultation, blood pressure and sugar screening, and eye '
             'testing by volunteer specialists. Spectacles are provided free of cost to '
             'those found to need them.', 200, True),
            (21, 'Digital Literacy Workshop for Women', 'Workshop', 'Training Room, First Floor',
             'A four-session workshop covering smartphone basics, online banking safety, '
             'government service portals and digital payments. Devices are provided for '
             'practice during the session.', 40, True),
            (33, 'Blood Donation Camp', 'Community Service', 'Community Centre Portico',
             'Organised jointly with the district blood bank. Donors must be between 18 and '
             '60 years of age and weigh at least 45 kg. Refreshments and donor cards are '
             'issued on the spot.', 120, True),
            (48, 'Inter-Ward Football Tournament — Opening Round', 'Sports', 'Nabin Sangha Ground',
             'Sixteen teams from eleven wards compete in a knock-out format over three '
             'weekends. Team registration is through the club office.', 0, True),
            (62, 'Annual General Meeting', 'Meeting', 'Community Centre Hall',
             'Presentation of the annual report and audited accounts, election of the '
             'executive committee for the next term, and consideration of resolutions '
             'received from members.', 0, False),
            (-9, 'Cleanliness Drive — Ward Canal', 'Community Service', 'Ward 12 Canal Bank',
             'Members and volunteers cleared 1.8 tonnes of waste along the canal bank in '
             'coordination with the municipal conservancy department.', 0, False),
            (-24, 'Career Guidance Seminar for Class XII', 'Workshop', 'Community Centre Hall',
             'Resource persons from three colleges spoke on stream selection, entrance '
             'examinations and scholarship schemes. 214 students attended.', 250, False),
            (-38, 'Annual Cultural Festival 2025 — Final Day', 'Cultural', 'Open Air Stage',
             'The concluding evening of the three-day festival, with the group theatre '
             'production “Alor Pathe” and the prize distribution ceremony.', 0, False),
            (-70, 'Independence Day Observance', 'Cultural', 'Community Centre Portico',
             'Flag hoisting, patriotic song recital by the music school, and distribution of '
             'sweets to children of the ward.', 0, False),
        ]
        events = []
        for offset, title, category, venue, description, capacity, registration_open in specs:
            start = (today + timedelta(days=offset)).replace(hour=10 if offset % 2 else 16,
                                                             minute=0, second=0, microsecond=0)
            event, _ = Event.objects.get_or_create(
                title=title,
                defaults={
                    'category': categories.get(f'event:{category}'),
                    'summary': description.split('.')[0] + '.',
                    'description': description,
                    'start': start,
                    'end': start + timedelta(hours=4),
                    'venue': venue,
                    'organizer': f'{ORG} — Programme Committee',
                    'capacity': capacity,
                    'registration_open': registration_open,
                    'registration_deadline': (start - timedelta(days=2)).date() if capacity else None,
                    'is_featured': offset in (7, 21),
                })
            events.append(event)
        return events

    def seed_news(self, categories):
        now = timezone.now()
        specs = [
            ('Online membership and event registration go live', 'Announcements', 0,
             'Members can now apply for membership, register for programmes and download '
             'documents through this portal.',
             'The executive committee is pleased to announce that the club’s services are now '
             'available online. Residents may apply for membership, register for programmes, '
             'download forms and reports, and track their participation through a personal '
             'dashboard.\n\n'
             'The office will continue to accept paper applications for those who prefer '
             'them. Members who need help creating an account may visit the office on any '
             'working day between 10 AM and 6 PM.', True),
            ('Club recognised as Best Youth Organisation of the Block', 'Achievements', 12,
             'The District Youth Welfare Board conferred the recognition at a ceremony held '
             'at the district headquarters.',
             'The District Youth Welfare Board has recognised the Sunrise Youth Club & '
             'Cultural Association as the Best Youth Organisation of the block for the year, '
             'citing sustained work in education support, community health and disaster relief.\n\n'
             'Receiving the award, the General Secretary said the recognition belonged to the '
             'two hundred volunteers who keep the library, the coaching classes and the '
             'health camps running through the year.', False),
            ('Notice: Annual General Meeting and election of office bearers', 'Notices', 5,
             'The Annual General Meeting will be held at the community centre. Members are '
             'requested to attend with their membership cards.',
             'Notice is hereby given that the Annual General Meeting of the members will be '
             'held at the Community Centre Hall as per the schedule published on the events '
             'page.\n\nAgenda:\n1. Confirmation of the minutes of the previous meeting.\n'
             '2. Presentation of the annual report.\n3. Adoption of the audited statement of '
             'accounts.\n4. Election of the executive committee for the next term.\n'
             '5. Any other matter with the permission of the chair.\n\n'
             'Members wishing to move a resolution should submit it in writing to the office '
             'at least seven days before the meeting.', False),
            ('Evening coaching classes resume from the first of next month', 'Announcements', 20,
             'Enrolment is open for students of classes V to X. There is no fee.',
             'Free evening coaching in mathematics, science and English resumes after the '
             'examination break. Classes are held from Monday to Friday between 5 PM and 7 PM '
             'at the community centre.\n\nParents may enrol students at the office with a '
             'copy of the school identity card. Seats in each batch are limited to thirty and '
             'are allotted in order of application.', False),
            ('Six blood donation camps collect 912 units in the year', 'Press Note', 34,
             'The club’s quarterly camps have contributed significantly to the district blood '
             'bank’s reserves.',
             'Six camps organised in cooperation with the district blood bank collected 912 '
             'units of blood during the year, the highest annual figure recorded by the club.\n\n'
             'The blood bank has requested an additional camp before the summer months, when '
             'reserves typically fall. The programme committee will announce the date shortly.', False),
            ('Group theatre production wins first prize at the state youth festival',
             'Achievements', 52,
             'The club’s production “Alor Pathe” was adjudged the best entry in the group '
             'theatre category.',
             'The club’s cultural wing has won the first prize in the group theatre category '
             'at the State Youth Festival for its production “Alor Pathe”, a play on migrant '
             'labour written and directed by members.\n\nThe cast of eleven rehearsed for four '
             'months in the community centre hall. The production will be staged locally at '
             'the annual cultural festival.', False),
        ]
        for title, category, days_ago, excerpt, body, featured in specs:
            Article.objects.get_or_create(
                title=title,
                defaults={'category': categories.get(f'news:{category}'),
                          'author': 'Office of the General Secretary',
                          'excerpt': excerpt, 'body': body,
                          'published_at': now - timedelta(days=days_ago),
                          'is_featured': featured})

    def seed_gallery(self, categories, events):
        specs = [
            ('Prize distribution at the annual sports meet', 'Sports Meet', 'photo', 30),
            ('Under-14 football final', 'Sports Meet', 'photo', 32),
            ('Athletics track events', 'Sports Meet', 'photo', 33),
            ('Group theatre — “Alor Pathe”', 'Annual Festival', 'photo', 52),
            ('Recitation competition for children', 'Annual Festival', 'photo', 53),
            ('Classical dance recital, opening evening', 'Annual Festival', 'photo', 54),
            ('Festival highlights film', 'Annual Festival', 'video', 55),
            ('Blood donation camp — registration desk', 'Community Camps', 'photo', 70),
            ('Eye screening at the health camp', 'Community Camps', 'photo', 72),
            ('Cleanliness drive along the ward canal', 'Community Camps', 'photo', 9),
            ('Digital literacy workshop for women', 'Workshops', 'photo', 21),
            ('Career guidance seminar for class XII', 'Workshops', 'photo', 24),
            ('Computer literacy batch in session', 'Workshops', 'photo', 40),
            ('Library reading room', 'Workshops', 'photo', 44),
            ('Evening coaching class', 'Workshops', 'photo', 46),
            ('Yoga session on the terrace', 'Community Camps', 'video', 60),
        ]
        for title, category, media_type, days_ago in specs:
            GalleryItem.objects.get_or_create(
                title=title,
                defaults={'category': categories.get(f'gallery:{category}'),
                          'media_type': media_type,
                          'video_url': 'https://www.youtube.com/' if media_type == 'video' else '',
                          'caption': f'{title} — photographed at a club programme.',
                          'taken_on': date.today() - timedelta(days=days_ago)})

    def seed_team(self, categories):
        specs = [
            ('Sanjib Chakraborty', 'President', 'Office Bearers', '2024–2027',
             'A retired headmaster who has served the club in various capacities since 2006. '
             'He led the fund-raising for the community centre building and continues to '
             'teach mathematics at the evening coaching classes.'),
            ('Mitali Bose', 'Vice President', 'Office Bearers', '2024–2027',
             'Coordinates the women’s skill-development wing and the annual health camps. '
             'A practising advocate, she also runs the club’s free legal-aid clinic.'),
            ('Arindam Ghosh', 'General Secretary', 'Office Bearers', '2024–2027',
             'Responsible for day-to-day administration, correspondence with the district '
             'administration, and the publication of the annual report.'),
            ('Priyanka Dutta', 'Assistant Secretary', 'Office Bearers', '2024–2027',
             'Handles membership records, event registration and the club’s digital services.'),
            ('Rakesh Sardar', 'Treasurer', 'Office Bearers', '2024–2027',
             'A chartered accountant by profession, he maintains the accounts and presents '
             'the audited statement to the general body each year.'),
            ('Debashis Roy', 'Sports Secretary', 'Executive Committee', '2024–2027',
             'Former district-level footballer who runs the coaching programme for two age groups.'),
            ('Sharmila Pal', 'Cultural Secretary', 'Executive Committee', '2024–2027',
             'Directs the group theatre wing and organises the annual cultural festival.'),
            ('Imran Sheikh', 'Library Secretary', 'Executive Committee', '2024–2027',
             'Manages the community library, its catalogue and the reading-room roster.'),
            ('Nabanita Mitra', 'Member', 'Executive Committee', '2024–2027',
             'Coordinates the evening coaching classes and volunteer teachers.'),
            ('Dr. Prabir Mondal', 'Medical Advisor', 'Advisors', '',
             'Consulting physician who has supervised the club’s health and blood donation '
             'camps for eight years.'),
            ('Prof. Kalyan Basu', 'Academic Advisor', 'Advisors', '',
             'Retired professor of economics; advises on the career guidance and scholarship '
             'assistance programmes.'),
            ('Sukanya Halder', 'Volunteer Coordinator', 'Coordinators', '',
             'Manages the roster of two hundred volunteers across programmes.'),
            ('Tanmoy Das', 'Ward Coordinator, Wards 10–12', 'Coordinators', '',
             'Point of contact for residents of the three wards nearest the community centre.'),
            ('Ayesha Rahman', 'Student Volunteer', 'Volunteers', '',
             'Second-year college student; teaches English at the evening coaching classes.'),
            ('Sourav Biswas', 'Student Volunteer', 'Volunteers', '',
             'Assists with event logistics, the sound system and the festival stage.'),
            ('Rina Mahato', 'Volunteer', 'Volunteers', '',
             'Runs the tailoring course for women under the skill-development wing.'),
        ]
        for order, (name, position, category, tenure, bio) in enumerate(specs):
            TeamMember.objects.get_or_create(
                name=name,
                defaults={'position': position, 'category': categories.get(f'team:{category}'),
                          'tenure': tenure, 'bio': bio, 'order': order,
                          'email': f'{name.split()[0].lower()}@sunriseyouthclub.example',
                          'facebook': 'https://www.facebook.com/',
                          'linkedin': 'https://www.linkedin.com/'})

    def seed_resources(self, categories):
        specs = [
            ('Membership Application Form', 'Forms', 'PDF, 240 KB',
             'Printable membership form for those who prefer to apply at the office.'),
            ('Event Participation Consent Form', 'Forms', 'PDF, 180 KB',
             'Required for participants below 18 years of age in sports events.'),
            ('Volunteer Enrolment Form', 'Forms', 'PDF, 165 KB',
             'For residents who wish to volunteer without taking membership.'),
            ('Annual Report 2024–25', 'Reports', 'PDF, 3.1 MB',
             'Programme-wise report of activities placed before the general body.'),
            ('Audited Statement of Accounts 2024–25', 'Reports', 'PDF, 1.4 MB',
             'Income and expenditure statement and balance sheet, with the auditor’s report.'),
            ('Annual Report 2023–24', 'Reports', 'PDF, 2.8 MB',
             'Programme-wise report of activities for the previous year.'),
            ('Memorandum and Rules of the Society', 'Rules & Regulations', 'PDF, 620 KB',
             'The registered memorandum, rules and byelaws governing the organisation.'),
            ('Code of Conduct for Members and Volunteers', 'Rules & Regulations', 'PDF, 210 KB',
             'Standards of conduct expected at programmes and on club premises.'),
            ('Library Membership Rules', 'Rules & Regulations', 'PDF, 150 KB',
             'Lending limits, renewal procedure and fines for the community library.'),
            ('Club Brochure', 'Brochures', 'PDF, 1.8 MB',
             'An overview of the organisation, its wings and its programmes.'),
            ('Cultural Festival Programme Schedule', 'Brochures', 'PDF, 900 KB',
             'Day-wise schedule of the annual cultural festival.'),
        ]
        for index, (title, category, file_label, description) in enumerate(specs):
            Resource.objects.get_or_create(
                title=title,
                defaults={'category': categories.get(f'resource:{category}'),
                          'description': description, 'file_label': file_label,
                          'published_on': date.today() - timedelta(days=30 + index * 21),
                          'downloads': 120 - index * 7})

    def seed_membership(self):
        benefits = [
            ('Free library membership', 'Borrowing rights at the community library and access '
                                        'to the reading room and periodicals.', '📚'),
            ('Priority event registration', 'Members are enrolled first when seats in a '
                                            'workshop or camp are limited.', '🎟'),
            ('Skill-development courses', 'Concessional fees for computer, tailoring and '
                                          'spoken English courses.', '🎓'),
            ('Participation certificates', 'Certificates for programmes attended, issued '
                                           'digitally through the member portal.', '🏅'),
            ('Voting rights', 'Members of one year’s standing may vote at the Annual General '
                              'Meeting and stand for the executive committee.', '🗳'),
            ('Sports and cultural teams', 'Eligibility to represent the club at inter-ward and '
                                          'district-level competitions.', '⚽'),
        ]
        for order, (title, description, icon) in enumerate(benefits):
            MembershipBenefit.objects.get_or_create(
                title=title, defaults={'description': description, 'icon': icon, 'order': order})

        interests = ['Sports & Athletics', 'Cultural Programmes', 'Library & Reading',
                     'Community Service', 'Health Camps', 'Teaching & Coaching',
                     'Event Management', 'Photography & Media', 'Environment & Cleanliness']
        for order, name in enumerate(interests):
            Interest.objects.get_or_create(name=name, defaults={'order': order})

    def seed_announcements(self, events):
        specs = [
            ('Applications open for the Digital Literacy Workshop for Women — 40 seats',
             'deadline', 1),
            ('Annual General Meeting: notice and agenda published', 'meeting', 3),
            ('Evening coaching classes resume from the first of next month', 'notice', 6),
            ('Blood donation camp — donor registration now open', 'event', 8),
            ('Annual Report 2024–25 and audited accounts available for download', 'notice', 12),
            ('Inter-ward football tournament: team entries close this week', 'deadline', 15),
            ('Results of the recitation competition published', 'result', 20),
        ]
        now = timezone.now()
        for title, kind, days_ago in specs:
            Announcement.objects.get_or_create(
                title=title,
                defaults={'kind': kind, 'published_at': now - timedelta(days=days_ago),
                          'is_new': days_ago < 10})

    def seed_members(self, events):
        """A demo login plus a handful of registrations, so the portal is not empty."""
        user, created = User.objects.get_or_create(
            username='member',
            defaults={'first_name': 'Ananya', 'last_name': 'Sengupta',
                      'email': 'ananya.sengupta@example.com'})
        if created:
            user.set_password('member12345')
            user.save()
        profile, _ = MemberProfile.objects.get_or_create(
            user=user,
            defaults={'status': 'active', 'phone': '+91 98300 11111',
                      'department': 'B.A. (Hons) — Second Year',
                      'address': 'Ward No. 12, Krishnanagar',
                      'date_of_birth': date(2003, 4, 17),
                      'joined_on': date.today() - timedelta(days=900)})
        profile.interests.set(Interest.objects.all()[:3])

        for event in events[:2] + events[6:8]:
            EventRegistration.objects.get_or_create(
                event=event, email=user.email,
                defaults={'user': user, 'full_name': user.get_full_name(),
                          'phone': profile.phone, 'attended': not event.is_upcoming})

        certificates = [
            ('Certificate of Participation — Annual Cultural Festival 2025', 40),
            ('Certificate of Appreciation — Blood Donation Camp Volunteer', 120),
            ('Course Completion — Spoken English (Batch 14)', 260),
        ]
        for title, days_ago in certificates:
            Certificate.objects.get_or_create(
                member=profile, title=title,
                defaults={'issued_on': date.today() - timedelta(days=days_ago),
                          'reference_no': f'CERT/{2026 - days_ago // 365}/{days_ago:04d}'})

        MembershipApplication.objects.get_or_create(
            email='sample.applicant@example.com',
            defaults={'full_name': 'Sample Applicant', 'phone': '+91 98300 22222',
                      'date_of_birth': date(2005, 9, 2),
                      'address': 'Ward No. 11, Krishnanagar',
                      'department': 'Class XII — Science',
                      'reason': 'I would like to volunteer at the library and the coaching classes.',
                      'status': 'pending'})
