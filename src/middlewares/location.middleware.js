import mongoose from "mongoose";
import MarkedSpot from "../../models/markedSpots.model.js";
import { errorHandler } from "../../utils/errorHandler.js";

const DEFAULT_MAX_RADIUS_METERS = 5;
const DEFAULT_ALLOWED_ROLES = ["hybrid", "coordinator"];

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of point 1 in degrees
 * @param {number} lon1 - Longitude of point 1 in degrees
 * @param {number} lat2 - Latitude of point 2 in degrees
 * @param {number} lon2 - Longitude of point 2 in degrees
 * @returns {number} Distance in meters
 */
export const calculateDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's mean radius in meters
  const toRad = (value) => (value * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Extracts and normalizes latitude and longitude from the incoming request.
 * Supports multiple payload formats:
 * - req.body.latitude & req.body.longitude (or lat & lng/long)
 * - req.body.coordinates: [longitude, latitude] or stringified JSON / comma-separated
 * - req.body.userLocation / currentLocation / location: object or array
 * - req.query / req.headers fallbacks
 *
 * @param {import("express").Request} req
 * @returns {{ latitude: number, longitude: number } | null}
 */
export const extractUserCoordinates = (req) => {
  const body = req.body || {};
  const query = req.query || {};
  const headers = req.headers || {};

  // 1. Explicit latitude & longitude fields
  const directLat =
    body.latitude ?? body.lat ?? query.latitude ?? query.lat ?? headers["x-user-latitude"];
  const directLng =
    body.longitude ?? body.lng ?? body.long ?? query.longitude ?? query.lng ?? query.long ?? headers["x-user-longitude"];

  if (directLat !== undefined && directLng !== undefined && directLat !== "" && directLng !== "") {
    const lat = Number(directLat);
    const lng = Number(directLng);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  // 2. Composite location formats (coordinates, userLocation, currentLocation, location)
  const candidate =
    body.coordinates ??
    body.userLocation ??
    body.currentLocation ??
    body.location ??
    query.coordinates ??
    query.userLocation ??
    headers["x-user-coordinates"];

  if (candidate !== undefined && candidate !== null && candidate !== "") {
    let parsed = candidate;

    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        const parts = parsed.split(",").map((p) => Number(p.trim()));
        if (parts.length === 2 && !parts.some(isNaN)) {
          parsed = parts;
        }
      }
    }

    // Key-value object: { lat, lng } or { latitude, longitude } or { coordinates: [...] }
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.coordinates) && parsed.coordinates.length >= 2) {
        parsed = parsed.coordinates;
      } else {
        const objLat = parsed.latitude ?? parsed.lat;
        const objLng = parsed.longitude ?? parsed.lng ?? parsed.long;
        if (objLat !== undefined && objLng !== undefined) {
          const lat = Number(objLat);
          const lng = Number(objLng);
          if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            return { latitude: lat, longitude: lng };
          }
        }
      }
    }

    // Array format: [longitude, latitude] (GeoJSON standard in SafaiWatch)
    if (Array.isArray(parsed) && parsed.length >= 2) {
      const val0 = Number(parsed[0]);
      const val1 = Number(parsed[1]);

      if (!isNaN(val0) && !isNaN(val1)) {
        // Disambiguate if values exceed latitude bounds (-90 to 90)
        if (Math.abs(val0) > 90 && Math.abs(val1) <= 90) {
          return { latitude: val1, longitude: val0 };
        }
        if (Math.abs(val1) > 90 && Math.abs(val0) <= 90) {
          return { latitude: val0, longitude: val1 };
        }
        // SafaiWatch GeoJSON standard: [longitude, latitude]
        if (val1 >= -90 && val1 <= 90 && val0 >= -180 && val0 <= 180) {
          return { latitude: val1, longitude: val0 };
        }
      }
    }
  }

  return null;
};

/**
 * Extracts normalized latitude and longitude from a MarkedSpot document.
 * SafaiWatch stores coordinates in GeoJSON format: [longitude, latitude].
 *
 * @param {Object} spot
 * @returns {{ latitude: number, longitude: number } | null}
 */
export const extractSpotCoordinates = (spot) => {
  if (!spot) return null;

  const rawCoords = spot.coordinates || spot.location?.coordinates;

  if (Array.isArray(rawCoords) && rawCoords.length >= 2) {
    const val0 = Number(rawCoords[0]);
    const val1 = Number(rawCoords[1]);

    if (!isNaN(val0) && !isNaN(val1)) {
      if (Math.abs(val0) > 90 && Math.abs(val1) <= 90) {
        return { latitude: val1, longitude: val0 };
      }
      if (Math.abs(val1) > 90 && Math.abs(val0) <= 90) {
        return { latitude: val0, longitude: val1 };
      }
      // Standard GeoJSON [longitude, latitude]
      return { latitude: val1, longitude: val0 };
    }
  }

  return null;
};

/**
 * Core verification logic to validate:
 * 1. User authentication and authorized roles (hybrid, coordinator)
 * 2. Spot existence and assigned ownership by the submitting user
 * 3. User's current location is within maxRadius meters of the marked spot (default: 5m)
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @param {number} maxRadius - Maximum allowed radius in meters (default 5m)
 * @param {string[]} [allowedRoles] - Roles permitted to submit completion
 */
const handleLocationVerification = async (
  req,
  res,
  next,
  maxRadius = DEFAULT_MAX_RADIUS_METERS,
  allowedRoles = DEFAULT_ALLOWED_ROLES
) => {
  try {
    // 1. User authentication check
    if (!req.user || !req.user._id) {
      return next(errorHandler(401, "Unauthorized: Authentication required."));
    }

    // 2. Role verification (hybrid and coordinator)
    const userRole = String(req.user.role || "").toLowerCase();
    const normalizedRoles = allowedRoles.map((r) => r.toLowerCase());

    if (!normalizedRoles.includes(userRole)) {
      return next(
        errorHandler(
          403,
          `Forbidden: Only Hybrid and Coordinator roles can submit spot completion. (Your role: ${req.user.role || "Unknown"})`
        )
      );
    }

    // 3. Spot ID retrieval and validation
    const spotId = req.params?.id || req.params?.spotId || req.body?.spotId || req.body?.markspotid;

    if (!spotId || !mongoose.Types.ObjectId.isValid(spotId)) {
      return next(errorHandler(400, "Invalid or missing Spot ID."));
    }

    // 4. Fetch the marked spot
    const spot = await MarkedSpot.findById(spotId);
    if (!spot) {
      return next(errorHandler(404, "Marked spot not found."));
    }

    if (spot.isCompleted) {
      return next(errorHandler(400, "Spot has already been completed."));
    }

    // 5. Verify the spot is assigned to this user
    const userId = req.user._id.toString();
    const isUserAssigned =
      Array.isArray(spot.isAssignedBy) &&
      spot.isAssignedBy.some(
        (entry) => entry?.assignedBy && entry.assignedBy.toString() === userId
      );

    if (!isUserAssigned) {
      return next(
        errorHandler(
          403,
          "Forbidden: You can only complete spots that are assigned to you. Please claim/assign yourself to this spot first."
        )
      );
    }

    // 6. Extract spot coordinates
    const spotCoords = extractSpotCoordinates(spot);
    if (!spotCoords) {
      return next(errorHandler(400, "Marked spot does not have valid coordinates to verify against."));
    }

    // 7. Extract user's current coordinates from request
    const userCoords = extractUserCoordinates(req);
    if (!userCoords) {
      return next(
        errorHandler(
          400,
          "Current user location (latitude and longitude) is required to verify physical proximity to the spot."
        )
      );
    }

    // 8. Distance check using Haversine formula (radius check: default 5 meters)
    const distanceMeters = calculateDistanceInMeters(
      userCoords.latitude,
      userCoords.longitude,
      spotCoords.latitude,
      spotCoords.longitude
    );

    if (distanceMeters > maxRadius) {
      const distanceDisplay =
        distanceMeters >= 1000
          ? `${(distanceMeters / 1000).toFixed(2)} km`
          : `${distanceMeters.toFixed(1)} m`;

      return next(
        errorHandler(
          403,
          `Location verification failed: You are ${distanceDisplay} away from the marked spot. You must be within ${maxRadius}m of the spot location to complete it.`
        )
      );
    }

    // 9. Attach verification metadata to request for downstream handlers
    req.spot = spot;
    req.spotLocation = spotCoords;
    req.userCurrentLocation = userCoords;
    req.distanceToSpotMeters = Math.round(distanceMeters * 100) / 100;
    req.isLocationVerified = true;

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware factory / middleware to verify user location against marked spot.
 * Can be used either as:
 * - verifySpotLocation (default 5m radius)
 * - verifySpotLocation(5)
 * - verifySpotLocation({ maxRadius: 5, roles: ['hybrid', 'coordinator'] })
 */
export const verifySpotLocation = (...args) => {
  // If invoked directly as middleware: verifySpotLocation(req, res, next)
  if (args.length >= 3 && typeof args[2] === "function") {
    const [req, res, next] = args;
    return handleLocationVerification(req, res, next, DEFAULT_MAX_RADIUS_METERS, DEFAULT_ALLOWED_ROLES);
  }

  // If invoked with configuration: verifySpotLocation(radius) or verifySpotLocation(options)
  let maxRadius = DEFAULT_MAX_RADIUS_METERS;
  let roles = DEFAULT_ALLOWED_ROLES;

  if (typeof args[0] === "number") {
    maxRadius = args[0];
  } else if (typeof args[0] === "object" && args[0] !== null) {
    if (args[0].maxRadius !== undefined) maxRadius = args[0].maxRadius;
    if (args[0].radius !== undefined) maxRadius = args[0].radius;
    if (Array.isArray(args[0].roles)) roles = args[0].roles;
  }

  return (req, res, next) => handleLocationVerification(req, res, next, maxRadius, roles);
};

export const locationMiddleware = verifySpotLocation;
export const checkSpotLocationRadius = verifySpotLocation;
export default verifySpotLocation;