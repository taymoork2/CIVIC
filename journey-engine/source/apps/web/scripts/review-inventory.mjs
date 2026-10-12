import { reviewInventory as connectorInventory } from '@civic/vite-connector/inventory'
import { laundryConnector } from './review-laundry-connector.mjs'

/** This host's review index: the Vite connector's, with Laundry's connector registered. */
export const reviewInventory = (repo, designRoot, appRepo, connection) => connectorInventory(repo, designRoot, appRepo, connection, { connector: laundryConnector })
