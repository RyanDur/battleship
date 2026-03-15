import * as Decoder from 'schemawax'

export type Config = {
  version: string
  serviceUrl: string
}

const configDecoder = Decoder.object({
  required: {
    version: Decoder.string,
    serviceUrl: Decoder.string,
  },
})

const DEFAULT_CONFIG: Config = {
  version: 'dev',
  serviceUrl: 'http://localhost:8080',
}

export const loadConfig = (url = `${import.meta.env.BASE_URL}config.json`): Promise<Config> =>
  fetch(url)
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(json => configDecoder.decode(json) ?? DEFAULT_CONFIG)
    .catch(() => DEFAULT_CONFIG)
