import { useState, useRef, useEffect, useCallback } from 'react'
import Worker from 'worker-loader?publicPath=/_next/&filename=static/chunks/[name].[hash].js&chunkFilename=static/chunks/[id].[contenthash].worker.js!../workers/postcss.worker.js'
import { requestResponse } from '../utils/workers'
import { debounce } from 'debounce'
import useMedia from 'react-use/lib/useMedia'
import { validateJavaScript } from '../utils/validateJavaScript'
import { useDebouncedState } from '../hooks/useDebouncedState'
import { toValidTailwindVersion } from '../utils/toValidTailwindVersion'
import Head from 'next/head'

const HEADER_HEIGHT = 60 - 1
const TAB_BAR_HEIGHT = 40
const RESIZER_SIZE = 1
const DEFAULT_RESPONSIVE_SIZE = { width: 540, height: 720 }

function Pen({
  initialContent,
  initialPath,
  initialLayout,
  initialResponsiveSize,
  initialActiveTab,
}) {
  const worker = useRef()
  const [size, setSize] = useState({ percentage: 0.5, layout: initialLayout })
  const [resizing, setResizing] = useState(false)
  const [result, setResult] = useState('')
  const [activeTab, setActiveTab] = useState(initialActiveTab)
  const [activePane, setActivePane] = useState(
    initialLayout === 'preview' ? 'preview' : 'editor'
  )
  const isMd = useMedia('(min-width: 768px)')
  const [dirty, setDirty] = useState(false)
  const [renderEditor, setRenderEditor] = useState(false)
  const [error, setError, setErrorImmediate, cancelSetError] =
    useDebouncedState(undefined, 1000)
  const [responsiveDesignMode, setResponsiveDesignMode] = useState(
    initialResponsiveSize ? true : false
  )
  const [shouldClearOnUpdate, setShouldClearOnUpdate] = useState(true)
  const [isLoading, setIsLoading, setIsLoadingImmediate] = useDebouncedState(
    false,
    1000
  )
  const [responsiveSize, setResponsiveSize] = useState(
    initialResponsiveSize || DEFAULT_RESPONSIVE_SIZE
  )
  const [tailwindVersion, setTailwindVersion] = useState('2')

  const [jit, setJit] = useState(true)

  useEffect(() => {
    setDirty(true)
  }, [
    activeTab,
    size.layout,
    responsiveSize.width,
    responsiveSize.height,
    responsiveDesignMode,
    tailwindVersion,
  ])

  useEffect(() => {
    if (dirty) {
      function handleUnload(e) {
        e.preventDefault()
        e.returnValue = ''
      }
      window.addEventListener('beforeunload', handleUnload)
      return () => {
        window.removeEventListener('beforeunload', handleUnload)
      }
    }
  }, [dirty])

  const [styles, setStyles] = useState({})

  useEffect(() => {
    window.addEventListener(
      'message',
      (event) => {
        // send a message back
        // event.ports[0].postMessage("Message back from the iframe");
        if (event && event.data) {
          if (event.data.name === 'styles') {
            let newStyles = event.data.styles

            delete newStyles['selectedNode']

            if (JSON.stringify(styles) !== JSON.stringify(newStyles)) {
              setStyles(newStyles)

              const req = newStyles.cssRequest

              debugger
              onChange({
                html: req.html,
                css: req.css,
                config: req.config,
                skipIntelliSense: false,
                tailwindVersion: toValidTailwindVersion('2'),
              })
            }
          }
        }
      },
      false
    )
  })

  const inject = useCallback((content) => {
    // previewRef.current.contentWindow.postMessage(content, '*')
    setResult(content.css)

    const payload = {
      type: 'updateCss',
      css: content.css,
    }
    window.top.postMessage(payload, '*')

    console.log('result', content.css)
  }, [])

  async function compileNow(content) {
    if (content.config) {
      let validateResult = await validateJavaScript(content.config)
      if (!validateResult.isValid) {
        return setError({ ...validateResult.error, file: 'Config' })
      }
    }
    cancelSetError()
    setIsLoading(true)
    const { css, html, jit, canceled, error } = await requestResponse(
      worker.current,
      content
    )

    if (canceled) {
      return
    }
    setIsLoadingImmediate(false)
    if (error) {
      setError(error)
      return
    }
    setErrorImmediate()
    setJit(jit)
    if (css || html) {
      inject({ css, html })
    }
  }

  const compile = useCallback(debounce(compileNow, 200), [])

  const onChange = useCallback(
    (content) => {
      setDirty(true)
      compile({
        html: content.html,
        css: content.css,
        config: content.config,
        skipIntelliSense: false,
        tailwindVersion,
      })
    },
    [inject, compile, jit, tailwindVersion]
  )

  useEffect(() => {
    worker.current = new Worker()
    return () => {
      worker.current.terminate()
    }
  }, [])

  return (
    <>
      <div>Test</div>
    </>
  )
}

export default function App({ errorCode, ...props }) {
  if (errorCode) {
    return <Error statusCode={errorCode} />
  }
  return <Pen {...props} />
}

export async function getServerSideProps({ params, res, query }) {
  const layoutProps = {}

  console.log(params.slug)

  if (
    !params.slug ||
    (params.slug.length === 1 && params.slug[0] === 'index')
  ) {
    res.setHeader(
      'cache-control',
      'public, max-age=0, must-revalidate, s-maxage=31536000'
    )
    return {
      props: {
        initialContent: '',
        ...layoutProps,
      },
    }
  }

  if (params.slug.length !== 1) {
    return {
      props: {
        errorCode: 404,
      },
    }
  }

  try {
    const { Item: initialContent } = await get({
      ID: params.slug[0],
    })

    res.setHeader(
      'cache-control',
      'public, max-age=0, must-revalidate, s-maxage=31536000'
    )

    return {
      props: {
        initialContent,
        initialPath: `/${initialContent.ID}${getLayoutQueryString({
          layout: query.layout,
          responsiveSize: query.size,
          file: query.file,
        })}`,
        ...layoutProps,
      },
    }
  } catch (error) {
    return {
      props: {
        errorCode: error.status || 500,
      },
    }
  }
}
