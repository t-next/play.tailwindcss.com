const { build } = require('esbuild')
const path = require('path')
const fs = require('fs').promises
const { PLUGIN_BUILDER_VERSION } = require('../constants')

const tailwindVersions = {
  v1: 'tailwindcss-v1',
  v2: 'tailwindcss',
  v3: 'tailwindcss-v3',
}
const plugins = [
  '@tailwindcss/custom-forms',
  '@tailwindcss/forms',
  '@tailwindcss/typography',
  '@tailwindcss/ui',
]

Object.keys(tailwindVersions).forEach((tailwindVersion) => {
  const tailwindModule = tailwindVersions[tailwindVersion]

  plugins.forEach(async (plugin) => {
    const pkg = require(`${plugin}/package.json`)

    const output = await build({
      entryPoints: [
        path.resolve(__dirname, `../../node_modules/${plugin}`, pkg.main),
      ],
      write: false,
      minify: true,
      bundle: true,
      external: ['fs', 'path', 'util'],
      format: 'esm',
      plugins: [
        {
          name: tailwindVersion,
          setup(build) {
            if (tailwindModule !== 'tailwindcss') {
              build.onResolve({ filter: /^tailwindcss(\/|$)/ }, (args) => ({
                path:
                  args.path.replace(
                    /^tailwindcss/,
                    path.resolve(
                      __dirname,
                      '../../node_modules',
                      tailwindModule
                    )
                  ) + '.js',
              }))
            }
          },
        },
      ],
    })

    await fs.mkdir(
      path.resolve(
        __dirname,
        '../../public/plugins',
        PLUGIN_BUILDER_VERSION,
        tailwindVersion
      ),
      {
        recursive: true,
      }
    )

    if (plugin.includes('/')) {
      const parts = plugin.split('/')
      await fs.mkdir(
        path.resolve(
          __dirname,
          '../../public/plugins',
          PLUGIN_BUILDER_VERSION,
          tailwindVersion,
          ...parts.slice(0, parts.length - 1)
        ),
        {
          recursive: true,
        }
      )
    }

    const code = new TextDecoder('utf-8').decode(output.outputFiles[0].contents)

    await fs.writeFile(
      path.resolve(
        __dirname,
        '../../public/plugins',
        PLUGIN_BUILDER_VERSION,
        tailwindVersion,
        `${plugin}@${pkg.version}.js`
      ),
      'var require = () => ({ deprecate: _ => _ });' + code,
      'utf8'
    )
  })
})
