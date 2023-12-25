import { createDiscreteApi } from 'naive-ui'
import { state, setting, previewItem, sidebar } from '../../store'
import { DirectoryTree } from '../types/types'

export const { message, dialog } = createDiscreteApi(['message', 'dialog'])

export const isReady = () => setting.baseUrl && state.ready

export const isLoading = () => state.loading

export const isWriting = () => state.writing.show

const reset = () => {
  state.img = 0
  state.audio = 0

  setting.previewIndex = setting.filesList.length

  previewItem.name = ''
  previewItem.path = ''

  sidebar.search = ''
}

export const checkDir = (url: string) => {
  state.filesNum = 0
  state.loading = true
  setTimeout(async () => {
    try {
      await _checkDir(url)

      setTimeout(() => {
        state.loading = false
      }, 500)
    } catch (err) {
      console.error(err)
      state.ready = false
      state.loading = false
      alert(err)
    }
  }, 50)
}

export const _checkDir = async (url: string) => {
  if (fs.existsSync(url)) {
    let _url: string
    if (fs.existsSync(path.join(url, 'www/data/System.json'))) {
      _url = 'www/'
    } else if (fs.existsSync(path.join(url, 'data/System.json'))) {
      _url = '/'
    } else {
      message.error('不是MZ/MZ目录或data/System.json不存在')
      return
    }

    const filePath = path.join(url, _url)
    if (filePath === setting.baseUrl) return

    setting.baseUrl = filePath
    console.log(filePath)
    setting.filePath = filePath

    const systemPath = path.join(filePath, 'data/System.json')
    const { encryptionKey, gameTitle } = fs.readJSONSync(systemPath)
    console.log(encryptionKey)
    setting.encryptionKey = encryptionKey
    document.title = gameTitle

    const imageFileTree = await getFileTree(path.join(filePath, 'img'), () => {
      state.filesNum += 1
    })
    setting.imageFileList = getFileList(imageFileTree)
    setting.imageFileTree = imageFileTree
    if (setting.imageFileTree?.name) {
      setting.imageFileTree.name = `图片[${state.img}]`
    }

    const audioFileTree = await getFileTree(path.join(filePath, 'audio'), () => {
      state.filesNum += 1
    })
    setting.audioFileList = getFileList(audioFileTree)
    setting.audioFileTree = audioFileTree
    if (setting.audioFileTree?.name) {
      setting.audioFileTree.name = `音频[${state.audio}]`
    }
    setting.filesList = [...setting.audioFileList, ...setting.imageFileList]

    reset()
    state.ready = true
  } else {
    message.error('路径不存在')
  }
}

const getFileTree = async (url: string, fn?: Function): Promise<DirectoryTree | undefined> => {
  if (isDirectory(url)) {
    const list = await fs.readdir(url)
    const dirTree: DirectoryTree = {
      name: path.basename(url),
      path: url,
      children: []
    }
    if (list.length > 0) {
      for (const subUrl of list) {
        const subItem = await getFileTree(path.join(url, subUrl), fn)
        if (subItem) {
          dirTree.children?.push(subItem)
        }
      }
    } else {
      dirTree.disabled = true
    }
    return dirTree
  } else {
    if (fn) {
      fn()
    }
    return {
      name: path.basename(url),
      path: url
    }
  }
}

export const getFileList = (obj?: DirectoryTree) => {
  if (!obj) return []
  const { children, name, path } = obj
  let list: {
    name: string
    path: string
  }[] = []
  if (children) {
    let i = children.length
    while (i--) {
      const child = children[i]
      list = [...list, ...getFileList(child)]
    }
  } else {
    if (/\.(png|png_|rpgmvp)$/i.test(name)) {
      state.img += 1
    }
    if (/\.(ogg|ogg_|m4a|m4a_|rpgmvo|rpgmvm)$/i.test(name)) {
      state.audio += 1
    }
    list.push({
      name,
      path
    })
  }
  return list
}

export const decryptBuffer = (arrayBuffer: ArrayBufferLike) => {
  const body = arrayBuffer.slice(16)
  const view = new DataView(body)
  const key = setting.encryptionKey.match(/.{2}/g)!

  for (let i = 0; i < 16; i++) {
    // console.log(view.getUint8(i), parseInt(key[i], 16))
    view.setUint8(i, view.getUint8(i) ^ parseInt(key[i], 16))
  }
  return body
}

export const encryptionBuffer = (arrayBuffer: ArrayBufferLike) => {
  const body = arrayBuffer
  const view = new DataView(body)
  const key = setting.encryptionKey.match(/.{2}/g)!

  for (let i = 0; i < 16; i++) {
    view.setUint8(i, view.getUint8(i) ^ parseInt(key[i], 16))
  }
  return Buffer.concat([Buffer.from(new ArrayBuffer(16)), Buffer.from(arrayBuffer)]).buffer
}

export const encryption = async (urls: string[]) => {
  state.writing.percentage = 0
  state.writing.total = urls.length
  state.writing.show = true
  for (const url of urls) {
    const res = new Uint8Array(encryptionBuffer((await fs.readFile(url)).buffer))
    await fs.outputFile(path.join(url, '..', `${path.basename(url, path.extname(url))}._`), res)
    state.writing.percentage += 1
  }
  setTimeout(() => {
    state.writing.show = false
  }, 500)
}

export const saveFile = (dir: string, type: 'img' | 'audio' | 'all' = 'all') => {
  state.writing.percentage = 0
  let filesList: {
    name: string
    path: string
  }[]
  if (type === 'img') {
    state.writing.total = setting.imageFileList.length
    filesList = setting.imageFileList
  } else if (type === 'audio') {
    state.writing.total = setting.audioFileList.length
    filesList = setting.audioFileList
  } else {
    state.writing.total = setting.filesList.length
    filesList = setting.filesList
  }
  state.writing.show = true

  setTimeout(async () => {
    try {
      for (const { name, path: filePath } of filesList) {
        const outPath = filePath
          .replace(setting.baseUrl, path.join(dir, `${document.title}-decrypt`))
          .replace(/\.(rpgmvp|png_)$/i, '.png')
          .replace(/\.(rpgmvo|ogg_)$/i, '.ogg')
          .replace(/\.(rpgmvm|m4a_)$/i, '.m4a')
        if (/\.(rpgmvo|ogg_|rpgmvm|m4a_|png_|rpgmvp)$/i.test(name)) {
          const res = new Uint8Array(decryptBuffer((await fs.readFile(filePath)).buffer))
          await fs.outputFile(outPath, res)
        } else {
          await fs.ensureDir(path.join(outPath, '..'))
          await fs.copyFile(filePath, outPath)
        }
        state.writing.percentage += 1
      }
    } catch (err) {
      state.writing.show = false
      alert(err)
    }
    setTimeout(() => {
      state.writing.show = false
    }, 500)
  }, 50)
}

export const decryptGame = () => {
  dialog.info({
    title: '解密游戏',
    content: '是否保存图片和音频原文件',
    positiveText: '保留',
    negativeText: '删除',
    maskClosable: true,
    onPositiveClick: () => {
      _decryptGame(true)
    },
    onNegativeClick: () => {
      _decryptGame(false)
    }
  })
}

export const _decryptGame = (backups: boolean) => {
  state.writing.percentage = 0
  state.writing.show = true

  setTimeout(async () => {
    try {
      const systemPath = path.join(setting.filePath, 'data/System.json')
      await fs.copyFile(
        path.join(setting.filePath, 'data/System.json'),
        path.join(setting.filePath, 'data/System.json.bak')
      )
      const systemData = await fs.readJSON(systemPath)

      if (systemData.hasEncryptedImages) {
        state.writing.total += setting.imageFileList.length

        for (const { name, path: filePath } of setting.imageFileList) {
          const outPath = filePath
            .replace(`${path.sep}img${path.sep}`, `${path.sep}_img_${path.sep}`)
            .replace(`${path.sep}audio${path.sep}`, `${path.sep}_audio_${path.sep}`)
            .replace(/\.(rpgmvp|png_)$/i, '.png')
            .replace(/\.(rpgmvo|ogg_)$/i, '.ogg')
            .replace(/\.(rpgmvm|m4a_)$/i, '.m4a')
          if (/\.(rpgmvo|ogg_|rpgmvm|m4a_|png_|rpgmvp)$/i.test(name)) {
            const res = new Uint8Array(decryptBuffer((await fs.readFile(filePath)).buffer))
            await fs.outputFile(outPath, res)
          } else {
            await fs.ensureDir(path.join(outPath, '..'))
            await fs.copyFile(filePath, outPath)
          }
          state.writing.percentage += 1
        }

        if (backups) {
          await fs.rename(path.join(setting.baseUrl, 'img'), path.join(setting.baseUrl, 'img.bak'))
        } else {
          await fs.remove(path.join(setting.baseUrl, 'img'))
        }
        await fs.rename(path.join(setting.baseUrl, '_img_'), path.join(setting.baseUrl, 'img'))

        systemData.hasEncryptedImages = false
      }

      if (systemData.hasEncryptedAudio) {
        state.writing.total += setting.audioFileList.length

        for (const { name, path: filePath } of setting.audioFileList) {
          const outPath = filePath
            .replace(`${path.sep}img${path.sep}`, `${path.sep}_img_${path.sep}`)
            .replace(`${path.sep}audio${path.sep}`, `${path.sep}_audio_${path.sep}`)
            .replace(/\.(rpgmvp|png_)$/i, '.png')
            .replace(/\.(rpgmvo|ogg_)$/i, '.ogg')
            .replace(/\.(rpgmvm|m4a_)$/i, '.m4a')
          if (/\.(rpgmvo|ogg_|rpgmvm|m4a_|png_|rpgmvp)$/i.test(name)) {
            const res = new Uint8Array(decryptBuffer((await fs.readFile(filePath)).buffer))
            await fs.outputFile(outPath, res)
          } else {
            await fs.ensureDir(path.join(outPath, '..'))
            await fs.copyFile(filePath, outPath)
          }
          state.writing.percentage += 1
        }

        if (backups) {
          await fs.rename(
            path.join(setting.baseUrl, 'audio'),
            path.join(setting.baseUrl, 'audio.bak')
          )
        } else {
          await fs.remove(path.join(setting.baseUrl, 'audio'))
        }
        await fs.rename(path.join(setting.baseUrl, '_audio_'), path.join(setting.baseUrl, 'audio'))

        systemData.hasEncryptedAudio = false
      }

      await fs.writeJSON(systemPath, systemData)

      if (await fs.exists(path.join(setting.baseUrl, 'nw.dll'))) {
        await fs.writeFile(path.join(setting.baseUrl, 'Game.rmmzproject'), 'RPGMZ 1.4.3')
      } else {
        await fs.writeFile(path.join(setting.baseUrl, 'Game.rpgproject'), 'RPGMV 1.6.1')
      }
    } catch (err) {
      state.writing.show = false
      alert(err)
    }
    setTimeout(() => {
      state.writing.show = false
      checkDir(setting.baseUrl)
    }, 500)
  }, 50)
}
