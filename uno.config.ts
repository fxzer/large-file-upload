import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  presetWebFonts,
} from 'unocss'

export default defineConfig({
  shortcuts: [
    ['flex-col', 'flex flex-col'],
    ['flex-x-center', 'flex justify-center'],
    ['flex-y-center', 'flex items-center'],
    ['flex-center', 'flex justify-center items-center'],
    ['flex-start-center', 'flex justify-start items-center'],
    ['btn', 'px-4 py-1 rounded inline-block bg-teal-600 text-white cursor-pointer hover:bg-teal-700 disabled:cursor-default disabled:bg-gray-600 disabled:opacity-50'],
    ['icon-btn', 'text-[0.9em] inline-block cursor-pointer select-none opacity-75 transition duration-200 ease-in-out hover:opacity-100 hover:text-teal-600 !outline-none'],
    [/^wh-(.+)$/, ([, c]) => `w-${c}  h-${c}`],
  ],
  rules: [
    [
      /^clamp-(\d+)$/,
      ([, d]) => ({
        'display': '-webkit-box',
        '-webkit-box-orient': ' vertical',
        '-webkit-line-clamp': d,
        'overflow': 'hidden',
      }),
    ],
    [
      /^sd-(\d+)-(\d+)$/,
      ([, d, a]) => ({
        'box-shadow': `0 0 ${d}px rgba(0, 0, 0, 0.${a})`,
      }),
    ],
  ],
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
      },
    }),
  ],
})
