import { Component } from 'vue'
import ArrowLeftIcon from './ArrowLeftIcon.vue'
import ArrowPathIcon from './ArrowPathIcon.vue'
import ArrowsUpDownIcon from './ArrowsUpDownIcon.vue'
import ChevronLeftIcon from './ChevronLeftIcon.vue'
import ChevronRightIcon from './ChevronRightIcon.vue'
import ChevronsLeftIcon from './ChevronsLeftIcon.vue'
import ChevronsRightIcon from './ChevronsRightIcon.vue'
import MoonIcon from './MoonIcon.vue'
import SettingsIcon from './SettingsIcon.vue'
import SlashIcon from './SlashIcon.vue'
import SolidCircleIcon from './SolidCircleIcon.vue'
import SunIcon from './SunIcon.vue'
import UserIcon from './UserIcon.vue'

export const iconRegistry: Record<string, Component> = {
  'arrow-left': ArrowLeftIcon,
  'arrow-path': ArrowPathIcon,
  'arrows-up-down': ArrowsUpDownIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'chevrons-left': ChevronsLeftIcon,
  'chevrons-right': ChevronsRightIcon,
  moon: MoonIcon,
  settings: SettingsIcon,
  slash: SlashIcon,
  'solid-circle': SolidCircleIcon,
  sun: SunIcon,
  user: UserIcon,
}

export type IconName = keyof typeof iconRegistry

export {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowsUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  MoonIcon,
  SettingsIcon,
  SlashIcon,
  SolidCircleIcon,
  SunIcon,
  UserIcon,
}
