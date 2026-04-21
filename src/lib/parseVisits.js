/**
 * @typedef {{
 *   location: { latitudeE7: number, longitudeE7: number, name?: string, placeId?: string },
 *   duration: { startTimestamp: string, endTimestamp: string },
 *   visitConfidence?: number
 * }} TakeoutPlaceVisit
 *
 * @typedef {{ timelineObjects: Array<{ placeVisit?: TakeoutPlaceVisit }> }} TakeoutJson
 *
 * @typedef {{
 *   lat: number, lng: number,
 *   name: string|null, placeId: string|null,
 *   neighborhood: string|null,
 *   start: Date, end: Date,
 *   dwellMinutes: number, confidence: number
 * }} Visit
 *
 * @typedef {{
 *   placeId: string, name: string|null,
 *   lat: number, lng: number,
 *   neighborhood: string|null,
 *   visitCount: number, totalDwellMinutes: number,
 *   familiarityScore: number
 * }} Place
 */

/**
 * Parse Google Takeout Semantic Location History JSON
 * and convert to an array of visit objects with real coordinates
 * and dwell time in minutes
 *
 * @param {TakeoutJson} takeoutJson
 * @returns {Visit[]}
 */
export function parseVisits(takeoutJson) {
	return takeoutJson.timelineObjects
		.filter((obj) => obj.placeVisit)
		.map((obj) => {
			const visit = /** @type {TakeoutPlaceVisit} */ (obj.placeVisit);
			const lat = visit.location.latitudeE7 / 1e7;
			const lng = visit.location.longitudeE7 / 1e7;

			const start = new Date(visit.duration.startTimestamp);
			const end = new Date(visit.duration.endTimestamp);
			const dwellMinutes = (end.getTime() - start.getTime()) / 1000 / 60;

			return {
				lat,
				lng,
				name: visit.location.name || null,
				placeId: visit.location.placeId || null,
				neighborhood: null, // populated server-side after geocoding
				start,
				end,
				dwellMinutes,
				confidence: visit.visitConfidence || 0
			};
		});
}

/**
 * Aggregate visits by placeId and compute a familiarity score.
 * Score is based on visit count and total dwell time.
 * Neighborhood is taken from the first visit for a given place.
 *
 * @param {Visit[]} visits
 * @returns {Place[]}
 */
export function computeFamiliarity(visits) {
	/** @type {Record<string, Place>} */
	const places = {};

	visits.forEach((visit) => {
		const key = visit.placeId || `${visit.lat.toFixed(4)},${visit.lng.toFixed(4)}`;

		if (!places[key]) {
			places[key] = {
				placeId: key,
				name: visit.name,
				lat: visit.lat,
				lng: visit.lng,
				neighborhood: visit.neighborhood ?? null,
				visitCount: 0,
				totalDwellMinutes: 0,
				familiarityScore: 0
			};
		}

		places[key].visitCount += 1;
		places[key].totalDwellMinutes += visit.dwellMinutes;
	});

	// normalize scores to 0-1 range
	const allPlaces = Object.values(places);
	const maxDwell = Math.max(...allPlaces.map((p) => p.totalDwellMinutes));
	const maxVisits = Math.max(...allPlaces.map((p) => p.visitCount));

	allPlaces.forEach((place) => {
		const dwellScore = place.totalDwellMinutes / maxDwell;
		const visitScore = place.visitCount / maxVisits;
		place.familiarityScore = dwellScore * 0.6 + visitScore * 0.4;
	});

	return allPlaces.sort((a, b) => b.familiarityScore - a.familiarityScore);
}
