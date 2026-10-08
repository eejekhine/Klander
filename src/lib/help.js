// Everything a new (or forgetful) user might need, in plain English.
// `show` is an action the app knows how to open, so each tip can take you straight there.
export const HELP = [
  {
    group: 'Getting around',
    items: [
      { id: 'swipe', title: 'Change week (or day, or month)', body: 'Swipe left on the calendar for the next week, right for the last one. A Today button appears when you are away from this week.', show: 'calendar' },
      { id: 'views', title: 'Switch between Day, Week, Month, List and People', body: 'Tap the month name at the top. People puts you and your friends side by side for one day.', show: 'views' },
      { id: 'faces', title: "Show or hide someone's events", body: "Tap a friend's photo at the top. Faded means hidden. A green dot means they're free right now.", show: 'calendar' },
      { id: 'groups', title: 'See just one group', body: 'Make a group in Friends (for example "Ballers"), then tap its name at the top to see only them. Tap again to see everyone.', show: 'friends' },
      { id: 'install', title: 'Put Klander on your Home Screen', body: 'In Safari tap Share, then Add to Home Screen. It then opens full screen like a normal app, and notifications work.' }
    ]
  },
  {
    group: 'Adding events',
    items: [
      { id: 'new', title: 'Add an event', body: 'Tap + at the bottom, then New event. Or tap an empty time on the week or day view.', show: 'add' },
      { id: 'smart', title: 'Smart add from text, a photo or a screenshot', body: 'Tap +, then Smart add. Type it like a text ("ball thurs 7 at the edge") or snap a poster, ticket, rota or timetable. Check the cards, then save.', show: 'smart' },
      { id: 'repeat', title: 'Repeating events and night shifts', body: 'Set Repeat when you make an event. Shifts that go past midnight work, and they stay at the right time when the clocks change.' },
      { id: 'privacy', title: 'Who can see an event', body: 'Friends see everything, Close shows details only to close friends, Busy only shows that you are busy, and Private is just for you.' },
      { id: 'countdown', title: 'Count down to something', body: 'Turn on "Count down to it" in an event and a "12 days to go" card shows at the top.' },
      { id: 'remind', title: 'Reminders', body: 'Pick a reminder in each event, or set a default under the bell.' },
      { id: 'links', title: 'Bring in your uni timetable or other calendars', body: 'Your photo (top right) → Linked calendars. Paste a calendar link from uni, Google, Outlook or iCloud and it keeps itself up to date.', show: 'calendars' }
    ]
  },
  {
    group: 'Friends and plans',
    items: [
      { id: 'addfriend', title: 'Add friends', body: 'Open Friends at the bottom. Search a username or share your invite link.', show: 'friends' },
      { id: 'find', title: 'Find a time everyone is free', body: 'Plans → Find a time. Pick friends, how long and when. Klander only looks at when people are busy, never what they are doing.', show: 'find' },
      { id: 'invite', title: 'Invite people and see who is going', body: 'Tap a free time (or add friends in any event). Guests answer Going, Maybe or Can\'t, and you can chat with everyone going.', show: 'plans' },
      { id: 'poll', title: 'Let friends vote on a time', body: 'In Find a time, turn on Let them vote, pick 2–5 times and send. When people have voted, tap Pick this time.', show: 'find' },
      { id: 'up', title: '"Up for something?"', body: 'Plans → Up for something. Post that you are free, and friends tap I\'m in. Turn it into a plan in one tap.', show: 'up' },
      { id: 'surprise', title: 'Surprise plans and birthdays', body: 'In an event, choose "Keep it a surprise from…". On a friend\'s birthday, tap Plan their birthday and it stays hidden from them.' },
      { id: 'close', title: 'Close friends', body: 'Tap a friend in Friends and switch on Close friend. Only you know who is on your list.', show: 'friends' },
      { id: 'catchup', title: 'Catch-up nudges', body: 'Plans suggests friends you have not made plans with for 3 weeks. Tap Later to hide one for a week.', show: 'plans' }
    ]
  },
  {
    group: 'Chat',
    items: [
      { id: 'chat', title: 'Message a friend or a group', body: 'Open Chat at the bottom and tap the new chat button. Pick one friend for a direct message, or a few for a group.', show: 'chat' },
      { id: 'react', title: 'React, reply, copy or delete', body: 'Tap any message to react with an emoji, reply, copy, delete your own, or report someone else\'s.', show: 'chat' },
      { id: 'chat2event', title: 'Turn a message into an event', body: 'Tap a message like "ball at 7 thursday", then Make an event. Smart add fills it in for you.', show: 'chat' },
      { id: 'share', title: 'Share an event or a photo', body: 'In a chat, tap the camera for a photo or the calendar for an event card. Photos are kept for 6 months.', show: 'chat' },
      { id: 'block', title: 'Mute, block or report', body: 'Tap the name at the top of a chat. Muting stops notifications; blocking stops direct messages from that person.', show: 'chat' }
    ]
  },
  {
    group: 'Notifications',
    items: [
      { id: 'push', title: 'Turn on notifications', body: 'Tap the bell, then Turn on notifications. On iPhone, Klander must be on your Home Screen first.', show: 'notify' },
      { id: 'quiet', title: 'Quiet hours and muting', body: 'Under the bell, set quiet hours (friend alerts wait until you are awake) and mute any friend. Your own reminders still come through.', show: 'notify' }
    ]
  },
  {
    group: 'Make it yours',
    items: [
      { id: 'themes', title: 'Change the look', body: 'Your photo → Themes and appearance. Pick a theme, describe a vibe for the AI to design one, or make one from a photo.', show: 'appearance' },
      { id: 'codes', title: 'Share a theme', body: 'In Themes, copy your theme code and send it, or try a friend\'s theme from their card.', show: 'appearance' },
      { id: 'bday', title: 'Add your birthday', body: 'Your photo → Birthday. Friends see the day, not your age, unless you switch that on.', show: 'settings' }
    ]
  }
]

/** Simple search across titles and text. */
export function searchHelp(q) {
  const t = q.trim().toLowerCase()
  if (!t) return HELP
  const words = t.split(/\s+/)
  return HELP.map(g => ({ ...g, items: g.items.filter(i => words.every(w => `${i.title} ${i.body} ${g.group}`.toLowerCase().includes(w))) })).filter(g => g.items.length)
}

export const TOUR = [
  { title: 'Welcome to Klander', body: 'Your calendar and your friends\' weeks, in one place. Here are the basics. It takes 20 seconds.', art: 'hello' },
  { title: 'Swipe to move', body: 'Swipe left and right to change week. Tap the month name to switch to Day, Month, List or People.', art: 'swipe' },
  { title: 'Add things fast', body: 'Tap + to add an event, or use Smart add: type it like a text, or snap a poster or timetable.', art: 'add' },
  { title: 'See your friends', body: 'Their events show in their colour. Tap a face at the top to show or hide them. Green dot = free now.', art: 'friends' },
  { title: 'Make plans', body: 'Plans finds a time everyone is free, sends invites and lets friends vote. Chat keeps it all together.', art: 'plans' },
  { title: 'Help is always here', body: 'Forgot how something works? Tap the month name, then Help & tips.', art: 'help' }
]
export const TOUR_KEY = 'klander:tour-done'
