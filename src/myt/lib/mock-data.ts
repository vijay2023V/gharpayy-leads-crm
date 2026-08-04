import { Zone, TeamMember, Tour, HeatmapData, Lead, Booking, TourType, Intent, ConfirmationStrength, WillBookToday, DecisionMaker } from './types';
import { scoreTour, inferConfirmationStrength } from './confidence';

export const zones: Zone[] = [
  { id: 'z1', name: 'Zone A — Koramangala', area: 'Koramangala' },
  { id: 'z2', name: 'Zone B — HSR Layout', area: 'HSR Layout' },
  { id: 'z3', name: 'Zone C — Indiranagar', area: 'Indiranagar' },
  { id: 'z4', name: 'Zone D — Whitefield', area: 'Whitefield' },
  { id: 'z5', name: 'Zone E — BTM Layout', area: 'BTM Layout' },
  { id: 'z6', name: 'Zone F — Electronic City', area: 'Electronic City' },
  { id: 'z7', name: 'Zone G — Marathahalli', area: 'Marathahalli' },
];

const names = [
  'Rahul Sharma','Priya Patel','Amit Kumar','Sneha Reddy','Vikram Singh',
  'Ananya Das','Karthik Nair','Divya Joshi','Rohan Gupta','Meera Iyer',
  'Arjun Rao','Pooja Verma','Nikhil Bhat','Swati Mishra','Aditya Menon',
  'Kavita Shetty','Sanjay Pillai','Ritu Agarwal','Deepak Hegde','Nisha Kulkarni',
  'Rajesh Mohan','Anjali Desai','Suresh Babu','Lakshmi Narayan','Manoj Tiwari',
  'Pallavi Deshpande','Harish Gowda','Sunita Yadav','Venkat Raman','Rekha Chandra',
  'Ashwin Pai','Geeta Saxena','Prakash Jain','Vandana Kapoor','Tarun Malhotra',
  'Shruti Bansal','Ravi Prasad','Kamala Devi','Sunil Patil','Uma Shankar',
  'Girish Srinivas','Bhavna Thakur',
];

export const teamMembers: TeamMember[] = names.map((name, i) => {
  const zoneIndex = Math.floor(i / 6);
  const zoneId = zones[Math.min(zoneIndex, 6)].id;
  const membersInZone = names.filter((_, j) => Math.floor(j / 6) === zoneIndex);
  const posInZone = membersInZone.indexOf(name);
  const role = posInZone < Math.ceil(membersInZone.length * 0.7) ? 'flow-ops' as const : 'tcm' as const;
  return {
    id: `m${i + 1}`,
    name,
    role,
    zoneId,
    phone: `+91 ${9800000000 + i}`,
  };
});

const properties = [
  'Prestige Lakeside','Brigade Meadows','Sobha Dream Acres','Godrej Splendour',
  'Mantri Serenity','Puravankara Zenium','Salarpuria Sattva','Embassy Springs',
  'Total Environment','Raheja Residency','Adarsh Palm Retreat','Shriram Greenfield',
];

const leadNames = [
  'Arun Mehta','Simran Kaur','Deepa Nair','Rajat Gupta','Neha Jain',
  'Sunil Reddy','Kavya Iyer','Mohit Sinha','Roshni Das','Akash Bose',
  'Tanya Sharma','Vivek Rao','Isha Kulkarni','Aman Verma','Shreya Pillai',
  'Kunal Desai','Megha Patil','Anil Tiwari','Prachi Hegde','Siddharth Menon',
  'Divya Saxena','Varun Kapoor','Nandini Agarwal','Harsh Malhotra','Poornima Shetty',
  'Ganesh Prasad','Ritika Joshi','Santosh Gowda','Meghna Chandra','Arjun Yadav',
  'Bhavika Shah','Rohit Bansal','Jaya Mohan','Kiran Babu','Snehal Deshpande',
  'Manikandan S','Trisha Roy','Uday Shankar','Lavanya Pai','Farhan Khan',
  'Ankita Thakur','Gaurav Srinivas','Reema Narayan','Nitin Bhat','Parul Mishra',
  'Dhruv Singh','Anisha Das','Tarun Nair','Sakshi Patel','Manish Kumar',
  'Shweta Reddy','Vikrant Sharma','Pallavi Iyer','Rajendra Gupta','Manju Verma',
  'Sagar Rao','Aishwarya Jain','Naveen Pillai','Chitra Desai','Karthik Patil',
  'Sunaina Tiwari','Ashish Hegde','Yamini Menon','Pranav Saxena','Richa Kapoor',
  'Abhishek Agarwal','Sonal Malhotra','Girija Shetty','Sameer Prasad','Vandana Joshi',
  'Ramesh Gowda','Swapna Chandra','Alok Yadav','Kritika Shah','Sudhir Bansal',
  'Mala Mohan','Arvind Babu','Geeta Deshpande','Pushpa S','Venkatesh Roy',
];

// Generate dates spread over last 30 days
function randomDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  return d.toISOString().split('T')[0];
}

const today = new Date().toISOString().split('T')[0];

const statuses: Tour['status'][] = ['scheduled','confirmed','completed','no-show','cancelled'];
const outcomes: Tour['outcome'][] = ['draft','follow-up','rejected', null];
const sources: Tour['bookingSource'][] = ['call','whatsapp','referral','walk-in'];

const tourTypes: TourType[] = ['physical', 'virtual', 'pre-book-pitch'];
const willBookOpts: WillBookToday[] = ['yes', 'maybe', 'no'];
const decisionMakers: DecisionMaker[] = ['self', 'parent', 'group'];
const roomTypes = ['Single', 'Double Sharing', 'Triple Sharing', 'Studio'];
const occupations = ['Infosys', 'Wipro', 'Amazon', 'Christ University', 'PES University', 'Flipkart'];
const concerns = ['food quality', 'roommate match', 'distance to office', 'parking', 'wifi speed'];

export const tours: Tour[] = Array.from({ length: 80 }, (_, i) => {
  const tcms = teamMembers.filter(m => m.role === 'tcm');
  const flowOps = teamMembers.filter(m => m.role === 'flow-ops');
  const assignee = tcms[i % tcms.length];
  const scheduler = flowOps[i % flowOps.length];
  const zone = zones.find(z => z.id === assignee.zoneId)!;
  const hour = 10 + (i % 11);
  const status = i < 20 ? 'completed' : i < 35 ? 'confirmed' : i < 50 ? 'scheduled' : i < 65 ? 'no-show' : 'cancelled';
  const showUp = status === 'completed' ? true : status === 'no-show' ? false : null;
  const outcome = status === 'completed' ? outcomes[i % 3]! : null;

  let tourDate: string;
  if (i < 30) {
    tourDate = today;
  } else if (i < 55) {
    const d = new Date();
    d.setDate(d.getDate() - (1 + (i % 6)));
    tourDate = d.toISOString().split('T')[0];
  } else {
    const d = new Date();
    d.setDate(d.getDate() - (7 + (i % 23)));
    tourDate = d.toISOString().split('T')[0];
  }

  // Build qualification + score
  const moveIn = new Date();
  moveIn.setDate(moveIn.getDate() + (i % 18));
  const budget = 7000 + (i % 20) * 500;
  const qualification = {
    moveInDate: moveIn.toISOString().split('T')[0],
    decisionMaker: decisionMakers[i % 3],
    roomType: roomTypes[i % roomTypes.length],
    occupation: occupations[i % occupations.length],
    workLocation: zone.area,
    willBookToday: willBookOpts[i % 3],
    readyIn48h: i % 4 === 0,
    exploring: i % 7 === 0,
    comparing: i % 5 === 0,
    needsFamily: i % 6 === 0,
    keyConcern: concerns[i % concerns.length],
  };
  const { score, intent, reason } = scoreTour(qualification, budget);
  const confirmationStrength: ConfirmationStrength = inferConfirmationStrength(qualification);

  return {
    id: `t${i + 1}`,
    leadName: leadNames[i % leadNames.length],
    phone: `+91 ${9700000000 + i}`,
    assignedTo: assignee.id,
    assignedToName: assignee.name,
    propertyName: properties[i % properties.length],
    area: zone.area,
    zoneId: zone.id,
    tourDate,
    tourTime: `${hour.toString().padStart(2, '0')}:${(i % 2 === 0 ? '00' : '30')}`,
    bookingSource: sources[i % sources.length],
    scheduledBy: scheduler.id,
    scheduledByName: scheduler.name,
    leadType: i % 3 === 0 ? 'urgent' : 'future',
    status,
    showUp,
    outcome,
    remarks: status === 'completed' ? (outcome === 'draft' ? 'Ready to sign' : outcome === 'follow-up' ? 'Needs another visit' : 'Budget mismatch') : '',
    budget,
    createdAt: new Date().toISOString(),
    tourType: tourTypes[i % 3],
    intent,
    confidenceScore: score,
    confidenceReason: reason,
    confirmationStrength,
    qualification,
    tokenPaid: outcome === 'booked' || (status === 'completed' && i % 11 === 0),
    whyLost: outcome === 'rejected' ? (['price','location','food','comparing'] as const)[i % 4] : null,
  };
});

// Fresh sessions should start empty; lead data is created in the live app flow.
export const initialLeads: Lead[] = [];

// Mock bookings
export const initialBookings: Booking[] = Array.from({ length: 12 }, (_, i) => {
  const tcms = teamMembers.filter(m => m.role === 'tcm');
  const closer = tcms[i % tcms.length];
  const statuses: Booking['agreementStatus'][] = ['pending', 'signed', 'moved-in'];
  return {
    id: `b${i + 1}`,
    leadName: leadNames[(i + 60) % leadNames.length],
    phone: `+91 ${9500000000 + i}`,
    propertyName: properties[i % properties.length],
    area: zones[i % zones.length].area,
    rentValue: 8000 + (i % 10) * 2000,
    viaTour: i % 3 !== 0,
    tourId: i % 3 !== 0 ? `t${i + 1}` : null,
    agreementStatus: statuses[i % 3],
    closedBy: closer.id,
    closedByName: closer.name,
    createdAt: randomDate(14),
  };
});

export const heatmapData: HeatmapData[] = [
  { hour: '10 AM', tours: 12, showUps: 9, drafts: 3 },
  { hour: '11 AM', tours: 15, showUps: 11, drafts: 4 },
  { hour: '12 PM', tours: 10, showUps: 7, drafts: 2 },
  { hour: '1 PM', tours: 8, showUps: 5, drafts: 1 },
  { hour: '2 PM', tours: 14, showUps: 10, drafts: 3 },
  { hour: '3 PM', tours: 11, showUps: 8, drafts: 3 },
  { hour: '4 PM', tours: 16, showUps: 13, drafts: 5 },
  { hour: '5 PM', tours: 13, showUps: 9, drafts: 2 },
  { hour: '6 PM', tours: 9, showUps: 7, drafts: 2 },
  { hour: '7 PM', tours: 6, showUps: 4, drafts: 1 },
  { hour: '8 PM', tours: 4, showUps: 3, drafts: 1 },
];

export function filterToursByDateRange(tourList: Tour[], range: DateRange): Tour[] {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  if (range === 'today') {
    return tourList.filter(t => t.tourDate === todayStr);
  }
  if (range === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return tourList.filter(t => new Date(t.tourDate) >= weekAgo);
  }
  // month
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);
  return tourList.filter(t => new Date(t.tourDate) >= monthAgo);
}

import { DateRange } from './types';

export function getZonePerformance(tourList: Tour[]) {
  return zones.map(zone => {
    const zoneTours = tourList.filter(t => t.zoneId === zone.id);
    const completed = zoneTours.filter(t => t.status === 'completed');
    const showed = zoneTours.filter(t => t.showUp === true);
    const drafts = zoneTours.filter(t => t.outcome === 'draft');
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      toursScheduled: zoneTours.length,
      toursCompleted: completed.length,
      showUpRate: zoneTours.length > 0 ? Math.round((showed.length / zoneTours.length) * 100) : 0,
      drafts: drafts.length,
      closures: Math.floor(drafts.length * 0.4),
    };
  });
}

export function getMemberPerformance(tourList: Tour[]) {
  return teamMembers.map(member => {
    const memberTours = member.role === 'tcm'
      ? tourList.filter(t => t.assignedTo === member.id)
      : tourList.filter(t => t.scheduledBy === member.id);
    const completed = memberTours.filter(t => t.status === 'completed');
    const showed = memberTours.filter(t => t.showUp === true);
    const drafts = memberTours.filter(t => t.outcome === 'draft');
    const zone = zones.find(z => z.id === member.zoneId);
    return {
      memberId: member.id,
      name: member.name,
      role: member.role,
      zoneName: zone?.name || '',
      leadsAdded: memberTours.length + Math.floor(Math.random() * 5),
      toursScheduled: memberTours.length,
      toursCompleted: completed.length,
      showUpRate: memberTours.length > 0 ? Math.round((showed.length / memberTours.length) * 100) : 0,
      drafts: drafts.length,
      closures: Math.floor(drafts.length * 0.4),
      sameDayRate: Math.round(40 + Math.random() * 40),
    };
  });
}
