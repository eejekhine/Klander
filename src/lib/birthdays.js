import { useCallback, useEffect, useState } from 'react'
import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns'
import { supabase } from './supabase'

/** Your own birthday (owner-only table) and your friends' (day/month, year only if they allow it). */
export function useBirthdays(uid) {
  const [mine, setMine] = useState(null) // { birthday: 'YYYY-MM-DD', show_year }
  const [friends, setFriends] = useState([]) // [{ user_id, month, day, year }]

  const refresh = useCallback(async () => {
    const [{ data: m }, { data: f }] = await Promise.all([
      supabase.from('birthdays').select('birthday, show_year').eq('user_id', uid).maybeSingle(),
      supabase.rpc('friend_birthdays')
    ])
    setMine(m || null); setFriends(f || [])
  }, [uid])
  useEffect(() => { refresh() }, [refresh])

  const saveMine = async (birthday, show_year) => {
    if (!birthday) {
      const { error } = await supabase.from('birthdays').delete().eq('user_id', uid)
      if (error) throw new Error(error.message)
      setMine(null); return
    }
    const { data, error } = await supabase.from('birthdays').upsert({ user_id: uid, birthday, show_year: !!show_year, updated_at: new Date().toISOString() }).select('birthday, show_year').single()
    if (error) throw new Error(/check/i.test(error.message) ? 'That date doesn\'t look right.' : error.message)
    setMine(data)
  }
  return { mine, friends, refresh, saveMine }
}

/** The date a birthday falls on in a given year (29 Feb becomes 28 Feb in other years). */
export function birthdayInYear(month, day, year) {
  if (month === 2 && day === 29) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return new Date(year, 1, leap ? 29 : 28)
  }
  return new Date(year, month - 1, day)
}

/** Turn birthdays into all-day calendar items between from and to. people: [{ id, person, month, day, year, me }] */
export function birthdayOccurrences(people, from, to) {
  const out = []
  for (const b of people) {
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
      const s = birthdayInYear(b.month, b.day, y)
      if (s >= to || addDays(s, 1) <= from) continue
      const firstName = (b.person.display_name || b.person.username || '').split(/\s+/)[0]
      const name = b.me ? 'Your' : `${firstName}'s`
      out.push({
        id: `bday-${b.id}-${y}`, key: `bday-${b.id}-${y}`, title: `${name} birthday`,
        all_day: true, start: s, end: addDays(s, 1), birthday: { ...b, short: b.me ? 'You' : firstName, age: b.year ? y - b.year : null }
      })
    }
  }
  return out
}

/** Next birthday from today: { date, inDays } */
export function nextBirthday(month, day, today = new Date()) {
  const t = startOfDay(today)
  let d = birthdayInYear(month, day, t.getFullYear())
  if (d < t) d = birthdayInYear(month, day, t.getFullYear() + 1)
  return { date: d, inDays: differenceInCalendarDays(d, t) }
}

export const isBirthdayToday = (month, day, today = new Date()) => nextBirthday(month, day, today).inDays === 0
