type DateTimeFormatOptions = Intl.DateTimeFormatOptions & {
  locale?: string
}

export const ISO_DATE: DateTimeFormatOptions = {
  locale: 'en-CA',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}

export const WEEKDAY_MONTH_DAY_YEAR: DateTimeFormatOptions = {
  locale: 'en-US',
  year: 'numeric',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

export const formatDateTime = (
  date: Date | string | undefined | null,
  options: DateTimeFormatOptions = {
    locale: 'en-US',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
) => {
  if (date == null) {
    return '-'
  }

  if (typeof date === 'string') {
    date = new Date(date)
  }

  return date.toLocaleDateString(options.locale, options)
}
