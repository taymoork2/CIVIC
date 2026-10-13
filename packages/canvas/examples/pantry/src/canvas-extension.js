// The app's own canvas extension (`adapter.extension` in civic.project.json). It places each flow under the
// manifest's navigation by its journey, since the scenarios name none, and puts the shopping list first.
const sections = { 'Plan shopping': 'Shopping' }
const order = ['Plan shopping', 'Keep the pantry']

export default {
  sectionOf: (flow) => sections[flow.label] ?? 'Pantry',
  arrange: (flows) => flows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)),
}
