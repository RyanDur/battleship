import * as Decoder from 'schemawax'
import type {CheckHealth} from '../components/ServiceHealth'
import {maybe} from '../lib/maybe'

const healthResponse = Decoder.object({
  required: {status: Decoder.literal('up'), version: Decoder.string},
})

export const checkHealth: CheckHealth = () =>
  fetch('http://127.0.0.1:8080/health')
    .then(response => response.json())
    .then(json => maybe(healthResponse.decode(json)).orNull() ?? undefined)
    .catch(() => undefined)
