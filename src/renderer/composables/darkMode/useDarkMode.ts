import { ref } from 'vue'

const STORAGE_KEY = 'chess-lens:dark-mode'

export function useDarkMode() {
  const isDark = ref(localStorage.getItem(STORAGE_KEY) === 'true')

  const applyClass = () => document.documentElement.classList.toggle('dark', isDark.value)

  const toggle = () => {
    isDark.value = !isDark.value
    localStorage.setItem(STORAGE_KEY, String(isDark.value))
    applyClass()
  }

  return { isDark, toggle, applyClass }
}
