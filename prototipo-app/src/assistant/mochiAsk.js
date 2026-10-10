// Preguntarle a Mochi por un producto: lo que se le pide al buscador con Mochi y el tipo con que viaja al arrastrarlo.

export const MOCHI_DRAG_TYPE = 'application/x-mochi-producto'

export const askAbout = (product) => `¿Con qué acompaño ${product.name}?`
