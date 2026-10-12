import { Type } from "@google/genai";
import { generateGeminiContent } from "../config/geminiConfig.js";
import cloudinary from "../config/cloudinaryConfig.js";
import { urlToGenerativePart } from "./urlToGenerativePart.utils.js";

// ==========================================
// CLOUDINARY GESTURE CACHE & HELPER
// ==========================================

let gestureCache = {
  urls: [],
  timestamp: 0,
};
const GESTURE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

/**
 * Retrieves a random gesture reference image URL from Cloudinary '/gestures' folder.
 * Uses an in-memory cache to minimize latency and prevent hitting Cloudinary Admin API rate limits.
 * @returns {Promise<string>}
 */
export async function getImageFRomCLoudinary() {
  const isCacheValid =
    gestureCache.urls.length > 0 &&
    Date.now() - gestureCache.timestamp < GESTURE_CACHE_TTL_MS;

  if (isCacheValid) {
    const randomUrl = gestureCache.urls[Math.floor(Math.random() * gestureCache.urls.length)];
    return randomUrl;
  }

  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "gestures",
      max_results: 30,
    });

    if (result?.resources && result.resources.length > 0) {
      gestureCache.urls = result.resources.map((r) => r.secure_url || r.url).filter(Boolean);
      gestureCache.timestamp = Date.now();
      const randomUrl = gestureCache.urls[Math.floor(Math.random() * gestureCache.urls.length)];
      return randomUrl;
    }
  } catch (error) {
    console.warn("Cloudinary gesture fetch warning:", error.message);
    // If cache has stale URLs, fallback to them
    if (gestureCache.urls.length > 0) {
      return gestureCache.urls[Math.floor(Math.random() * gestureCache.urls.length)];
    }
  }

  if (gestureCache.urls.length === 0) {
    throw new Error("No gesture reference images found in Cloudinary folder '/gestures'");
  }

  return gestureCache.urls[0];
}

// Alias with standard camelCase
export const getImageFromCloudinary = getImageFRomCLoudinary;

// ==========================================
// SYSTEM INSTRUCTION PROMPTS
// ==========================================

const PROMPT_HEADER = `You are the visual auditing and forensic inspection agent for SafaiWatch, a civic sanitation management platform.
Your objective is to evaluate submitted civic report images, verify their authenticity against digital fraud or synthetic manipulation, and assess waste criticality.`;

const PHASE_FORENSICS = `
PHASE 1: DIGITAL FORENSICS & SYNTHETIC MEDIA DETECTION
Analyze the image for signs of artificial generation, manipulation, or digital tampering:
1. AI/Synthetic Generation Artifacts:
   - Hands/Digits: Inspect for warped geometry, fused/extra fingers, missing knuckles, unnatural joint angles, or plastic/waxy skin textures.
   - Background Consistency: Look for nonsensical/hallucinated text on signs, floating or melted debris, inconsistent vanishing points, or signature generative AI depth-of-field blur.
   - Lighting/Shadows: Check for illumination directions on the foreground that contradict background shadows or light sources.
2. Digital Edits & Compositing:
   - Cut-and-Paste Edges: Look for harsh outline halos, aliasing differences, or unnatural anti-aliasing borders around the foreground.
   - Noise & Grain Mismatch: Check if sensor noise/ISO grain in foreground areas differs from the background waste area.
   - Screen Captures: Look for screen moiré patterns (interference lines indicating a photo taken off a computer or phone display).

RULE: If ANY synthetic generation, deepfake rendering, or digital editing is detected, set isAiOrEdited = true, set isFraudulent = true, set fraudReason = "AI_GENERATED_OR_EDITED", and document the exact visual anomaly in forensicDetails.
`;

const PHASE_GESTURE_COMPARISON = `
PHASE 2: GESTURE VERIFICATION & POSITIONAL AUDIT
Compare the hand gesture in the foreground of Image 2 directly against the target gesture guide in Image 1:
1. Pose Alignment: Verify that the finger extension, thumb placement, and palm orientation in Image 2 match the structural pose in Image 1.
2. Physical Presence: Confirm that the hand is a real, physical hand positioned live in front of the camera lens, rather than a sticker, printout, or 2D image overlay.
3. Obscured Gestures: If the hand is cut off by the frame boundary, severely motion-blurred, or too dark to distinguish finger positions, mark the gesture as unverified.

RULE: If the hand gesture in Image 2 does not match Image 1, or is missing/unclear, set gestureMatched = false, set isFraudulent = true, and set fraudReason = "GESTURE_MISMATCH".
`;

const PHASE_CODE_VERIFICATION = (targetCode) => `
PHASE 2: CODE WORD VERIFICATION
Verify that the target code "${targetCode}" is written (on paper, cardboard, slate, or board) and physically present in the photo near the waste site:
1. Read any visible text or code written in the foreground or on any paper/cardboard in the image.
2. Match it case-insensitively against the target code "${targetCode}".

RULE: If the code "${targetCode}" is missing, unreadable, or incorrect, set codeMatched = false, set isFraudulent = true, and set fraudReason = "CODE_MISMATCH".
`;

const PHASE_WASTE_INSPECTION = `
PHASE 3: MUNICIPAL WASTE SITE VERIFICATION
Evaluate the image background to confirm a legitimate civic waste incident:
1. Outdoor/Public Context: Confirm the scene is in a municipal, public, or outdoor space (e.g., street, sidewalk, public park, vacant lot, gutter, public drainage).
2. Waste Identification: Verify the presence of real physical garbage, litter piles, overflowing dumpsters, plastic waste, organic waste, or construction debris.
3. Indoor/Irrelevant Rejection: Flag clean indoor home environments, private room interiors, organized personal spaces, or non-waste objects.

RULE: If the image lacks real outdoor waste or shows a non-waste scene, set isValidWasteReport = false, set isFraudulent = true, and set fraudReason = "NO_WASTE_DETECTED".
`;

const PHASE_CRITICALITY_EVALUATION = `
PHASE 4: WASTE CRITICALITY & SEVERITY EVALUATION
Evaluate the scale, environmental hazard, and urgency of the waste incident shown in the image.
Categorize the criticality level (\`critcal\`) using one of these four exact categories:
- "Very High": Severe public health or environmental emergency — massive illegal dumping, toxic/hazardous waste, medical waste, or severe garbage accumulation completely blocking roads, public transit, or drainage waterways.
- "High": Heavy waste accumulation — large overflowing dumpster piles, major street littering, large open garbage heaps impacting public walkways or drainage.
- "Medium": Moderate waste site — scattered household trash, multiple garbage bags, or localized debris requiring standard municipal cleanup.
- "Low": Minor incident — small isolated litter item, single piece of trash, or light scattered debris.

RULE: Assign \`critcal\` to one of ["Very High", "High", "Medium", "Low"] reflecting the visual severity of the reported waste incident.
`;

const PROMPT_OUTPUT_DIRECTIVE = `
OUTPUT DIRECTIVE:
Provide your final verdict strictly matching the required JSON schema. Maintain deterministic, objective, and strict evaluation standards to protect platform integrity.
`;

export const SYSTEM_INSTRUCTION_WITH_FORENSICS = `
${PROMPT_HEADER}
Your objective is to evaluate a submitted report image (Image 2) against a target hand gesture reference icon (Image 1) and determine if the report is authentic, verified, free of fraud, and assess its waste criticality level.

Conduct a rigorous step-by-step audit:
${PHASE_FORENSICS}
${PHASE_GESTURE_COMPARISON}
${PHASE_WASTE_INSPECTION}
${PHASE_CRITICALITY_EVALUATION}
${PROMPT_OUTPUT_DIRECTIVE}
`;

export const SYSTEM_INSTRUCTION_CODE_FORENSICS = (targetCode) => `
${PROMPT_HEADER}
Your objective is to evaluate a submitted report image against a target verification code "${targetCode}" and determine if the report is authentic, verified, free of fraud, and assess its waste criticality level.

Conduct a rigorous step-by-step audit:
${PHASE_FORENSICS}
${PHASE_CODE_VERIFICATION(targetCode)}
${PHASE_WASTE_INSPECTION}
${PHASE_CRITICALITY_EVALUATION}
${PROMPT_OUTPUT_DIRECTIVE}
`;

export const SYSTEM_INSTRUCTION_WASTE_FORENSICS = `
${PROMPT_HEADER}
Your objective is to evaluate a submitted report image to determine if it contains actual municipal waste in a public outdoor setting, check for digital manipulation/AI generation, and assess its waste criticality level.

Conduct a rigorous step-by-step audit:
${PHASE_FORENSICS}
${PHASE_WASTE_INSPECTION}
${PHASE_CRITICALITY_EVALUATION}
${PROMPT_OUTPUT_DIRECTIVE}
`;

export const SYSTEM_INSTRUCTION_WASTE_CODE_FORENSICS = (targetCode) => `
${PROMPT_HEADER}
Your objective is to evaluate a submitted report image against a target verification code "${targetCode}", check for digital manipulation/AI generation, verify the presence of actual municipal waste in a public outdoor setting, and assess its waste criticality level.

Conduct a rigorous step-by-step audit:
${PHASE_FORENSICS}
${PHASE_CODE_VERIFICATION(targetCode)}
${PHASE_WASTE_INSPECTION}
${PHASE_CRITICALITY_EVALUATION}
${PROMPT_OUTPUT_DIRECTIVE}
`;

// ==========================================
// GEMINI JSON SCHEMAS
// ==========================================

const BASE_PROPERTIES = {
  isAiOrEdited: {
    type: Type.BOOLEAN,
    description: "True if synthetic rendering, deepfake artifacts, digital compositing, or photo-editing is detected.",
  },
  forensicConfidence: {
    type: Type.NUMBER,
    description: "Confidence score between 0.00 and 1.00 for the forensic analysis authenticity rating.",
  },
  critcal: {
    type: Type.STRING,
    enum: ["Very High", "High", "Medium", "Low"],
    description: "Evaluated critical severity level of the reported waste incident ('Very High', 'High', 'Medium', or 'Low').",
  },
  detectedManipulationType: {
    type: Type.STRING,
    enum: ["AI_GENERATED", "DIGITAL_COMPOSITE_EDIT", "SCREENSHOT", "AUTHENTIC_PHOTO"],
    description: "Primary forensic classification of the uploaded image.",
  },
  forensicDetails: {
    type: Type.STRING,
    description: "Detailed description of observed forensic anomalies (e.g., fused digits, lighting inconsistencies, moiré lines, cut-and-paste halos).",
  },
  isValidWasteReport: {
    type: Type.BOOLEAN,
    description: "True ONLY if real outdoor municipal waste is present in a public setting.",
  },
  isFraudulent: {
    type: Type.BOOLEAN,
    description: "True if isAiOrEdited is true, verification criteria fail, or no outdoor waste is present.",
  },
  fraudReason: {
    type: Type.STRING,
    enum: ["AI_GENERATED_OR_EDITED", "GESTURE_MISMATCH", "CODE_MISMATCH", "SCREENSHOT", "NO_WASTE_DETECTED", "NONE"],
    description: "Primary failure code if flagged as fraudulent.",
  },
  summary: {
    type: Type.STRING,
    description: "Concise 1-2 sentence description summarizing the visual audit outcome.",
  },
};

const GESTURE_PROPERTIES = {
  gestureMatched: {
    type: Type.BOOLEAN,
    description: "True strictly if the foreground hand gesture matches the target gesture guide.",
  },
  detectedGestureName: {
    type: Type.STRING,
    description: "Name or description of the hand gesture observed in the image (e.g. PEACE, THUMBS_UP, UNKNOWN).",
  },
};

const CODE_PROPERTIES = {
  codeMatched: {
    type: Type.BOOLEAN,
    description: "True if the target code is clearly written and detected in the image.",
  },
  detectedCodeText: {
    type: Type.STRING,
    description: "The code text observed in the image.",
  },
};

export const SAFEIWATCH_AUDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ...BASE_PROPERTIES,
    ...GESTURE_PROPERTIES,
  },
  required: [
    "isAiOrEdited",
    "forensicConfidence",
    "critcal",
    "detectedManipulationType",
    "forensicDetails",
    "gestureMatched",
    "detectedGestureName",
    "isValidWasteReport",
    "isFraudulent",
    "fraudReason",
    "summary",
  ],
};

export const SAFEIWATCH_CODE_AUDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ...BASE_PROPERTIES,
    ...CODE_PROPERTIES,
  },
  required: [
    "isAiOrEdited",
    "forensicConfidence",
    "critcal",
    "detectedManipulationType",
    "forensicDetails",
    "codeMatched",
    "detectedCodeText",
    "isValidWasteReport",
    "isFraudulent",
    "fraudReason",
    "summary",
  ],
};

export const SAFEIWATCH_WASTE_AUDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ...BASE_PROPERTIES,
    ...GESTURE_PROPERTIES,
  },
  required: [
    "isAiOrEdited",
    "forensicConfidence",
    "critcal",
    "detectedManipulationType",
    "forensicDetails",
    "gestureMatched",
    "detectedGestureName",
    "isValidWasteReport",
    "isFraudulent",
    "fraudReason",
    "summary",
  ],
};

export const SAFEIWATCH_WASTE_CODE_AUDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ...BASE_PROPERTIES,
    ...CODE_PROPERTIES,
  },
  required: [
    "isAiOrEdited",
    "forensicConfidence",
    "critcal",
    "detectedManipulationType",
    "forensicDetails",
    "codeMatched",
    "detectedCodeText",
    "isValidWasteReport",
    "isFraudulent",
    "fraudReason",
    "summary",
  ],
};

// ==========================================
// PARSING & RESULT SANITIZATION UTILITIES
// ==========================================

/**
 * Parses and sanitizes JSON string returned from LLM, stripping markdown code fences if present.
 * @param {string|object} data
 * @returns {object|null}
 */
function cleanAndParseJson(data) {
  if (typeof data !== "string") return data;
  let text = data.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "").trim();
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerErr) {
        // Fall through to logging
      }
    }
    console.error("Failed to parse Gemini audit JSON response:", err.message);
    return null;
  }
}

/**
 * Normalizes verification payload parameters.
 * @param {string|object|null} verificationData
 * @returns {{ type: 'code'|'gesture'|'waste', data: string }}
 */
function parseVerificationData(verificationData) {
  let type = "gesture";
  let data = "";

  if (typeof verificationData === "string") {
    const normalized = verificationData.toLowerCase().trim();
    if (["code", "gesture", "waste", "wasteonly", "waste_only"].includes(normalized)) {
      type = normalized.startsWith("waste") ? "waste" : normalized;
    } else {
      data = verificationData.trim();
    }
  } else if (typeof verificationData === "object" && verificationData !== null) {
    const rawType = (verificationData.type || "gesture").toLowerCase().trim();
    type = rawType.startsWith("waste") ? "waste" : rawType;
    data = (
      verificationData.data ||
      verificationData.code ||
      verificationData.gestureImage ||
      verificationData.guestureImage ||
      ""
    ).toString().trim();
  }

  return { type, data };
}

/**
 * Extracts image input and MIME type from various caller formats.
 */
function resolveInput(input, fallbackMime) {
  if (typeof input === "object" && input !== null && !Buffer.isBuffer(input)) {
    return {
      source: input.fileBuffer || input.fileInput || input.url || input,
      mimeType: input.mimeType || fallbackMime || "image/jpeg",
    };
  }
  return {
    source: input,
    mimeType: fallbackMime || "image/jpeg",
  };
}

/**
 * Formats and normalizes audit output for callers and controllers.
 */
function normalizeAuditResult(rawResult, type = "gesture", targetCode = "") {
  const result = rawResult && typeof rawResult === "object" ? rawResult : {};
  const isFraudulent = Boolean(result.isFraudulent || result.isAiOrEdited);
  const criticalValue = result.critcal || result.critical || "Low";

  return {
    isAiOrEdited: Boolean(result.isAiOrEdited),
    forensicConfidence: typeof result.forensicConfidence === "number" ? result.forensicConfidence : 0.9,
    critcal: criticalValue,
    critical: criticalValue,
    detectedManipulationType:
      result.detectedManipulationType || (result.isAiOrEdited ? "AI_GENERATED" : "AUTHENTIC_PHOTO"),
    forensicDetails: result.forensicDetails || "",
    ...(type === "gesture" || result.gestureMatched !== undefined
      ? {
          gestureMatched: Boolean(result.gestureMatched),
          detectedGestureName: result.detectedGestureName || "UNKNOWN",
        }
      : {}),
    ...(type === "code" || result.codeMatched !== undefined
      ? {
          codeMatched: Boolean(result.codeMatched),
          detectedCodeText: result.detectedCodeText || result.detectedCode || targetCode,
          detectedCode: result.detectedCode || result.detectedCodeText || targetCode,
        }
      : {}),
    isValidWasteReport: Boolean(result.isValidWasteReport),
    isFraudulent,
    fraudReason: result.fraudReason || (isFraudulent ? "VERIFICATION_FAILED" : "NONE"),
    summary: result.summary || "Visual audit completed.",
  };
}

/**
 * Generates deterministic mock result for testing and simulation environments.
 */
const createSimulationResult = (type = "gesture", targetCode = "") => ({
  isAiOrEdited: false,
  forensicConfidence: 0.98,
  critcal: "Low",
  critical: "Low",
  detectedManipulationType: "AUTHENTIC_PHOTO",
  forensicDetails: "Simulation mode: No digital anomalies detected.",
  ...(type === "gesture" ? { gestureMatched: true, detectedGestureName: "PEACE" } : {}),
  ...(type === "code"
    ? {
        codeMatched: true,
        detectedCodeText: targetCode || "VERIFIED",
        detectedCode: targetCode || "VERIFIED",
      }
    : {}),
  isValidWasteReport: true,
  isFraudulent: false,
  fraudReason: "NONE",
  summary: "Simulation mode: The report image is authentic and meets all verification criteria.",
});

// ==========================================
// CORE AUDITING FUNCTIONS
// ==========================================

/**
 * Audits a submitted report photo against a target hand gesture or code word.
 *
 * @param {string|Buffer|object} input - Image URL, data URL, Buffer, or object { fileBuffer, url, mimeType }
 * @param {string} [mimeTypeParam='image/jpeg'] - MIME type of the input photo
 * @param {string|object} [verificationData='gesture'] - Verification payload (code string, gesture image URL, or config object)
 * @param {string} [what='real'] - Mode: 'real' or 'simulation'
 * @returns {Promise<object>} Visual audit verdict object
 */
export const aiPhotoVerification = async (input, mimeTypeParam, verificationData, what) => {
  if (what === "simulation" || verificationData === "simulation") {
    const { type, data } = parseVerificationData(verificationData);
    return createSimulationResult(type, data);
  }

  const { source, mimeType } = resolveInput(input, mimeTypeParam);
  const { type, data } = parseVerificationData(verificationData);

  try {
    const filePart = await urlToGenerativePart(source, mimeType);

    // 1. Verification by Code
    if (type === "code") {
      const targetCode = data;
      const response = await generateGeminiContent({
        contents: [filePart],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_CODE_FORENSICS(targetCode),
          responseMimeType: "application/json",
          responseSchema: SAFEIWATCH_CODE_AUDIT_SCHEMA,
          temperature: 0.1,
        },
      });

      const parsed = cleanAndParseJson(response);
      return normalizeAuditResult(parsed, "code", targetCode);
    }

    // 2. Verification by Waste Only
    if (type === "waste") {
      const response = await generateGeminiContent({
        contents: [filePart],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_WASTE_FORENSICS,
          responseMimeType: "application/json",
          responseSchema: SAFEIWATCH_WASTE_AUDIT_SCHEMA,
          temperature: 0.1,
        },
      });

      const parsed = cleanAndParseJson(response);
      return normalizeAuditResult(parsed, "waste");
    }

    // 3. Default: Verification by Gesture (foreground photo vs reference gesture image)
    const remoteImageUrl =
      typeof data === "string" && data.startsWith("http")
        ? data
        : await getImageFRomCLoudinary();

    const randomRemoteImage = await urlToGenerativePart(remoteImageUrl);

    const response = await generateGeminiContent({
      contents: [filePart, randomRemoteImage],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_WITH_FORENSICS,
        responseMimeType: "application/json",
        responseSchema: SAFEIWATCH_AUDIT_SCHEMA,
        temperature: 0.1,
      },
    });

    const parsed = cleanAndParseJson(response);
    return normalizeAuditResult(parsed, "gesture");
  } catch (error) {
    console.error("Error in aiPhotoVerification:", error);
    throw error;
  }
};

/**
 * Audits a submitted report photo specifically for municipal waste and digital integrity.
 *
 * @param {string} url - Image URL or data URL
 * @param {string|object} [verificationData='waste'] - Verification configuration
 * @param {string} [what='real'] - Mode: 'real' or 'simulation'
 * @returns {Promise<object>} Visual audit verdict object
 */
export const wasteVerification = async (url, verificationData, what) => {
  if (what === "simulation" || verificationData === "simulation") {
    const { type, data } = parseVerificationData(verificationData);
    return createSimulationResult(type === "code" ? "code" : "waste", data);
  }

  const { type, data } = parseVerificationData(verificationData);

  try {
    const filePart = await urlToGenerativePart(url);

    // Code verification mode
    if (type === "code") {
      const targetCode = data;
      const response = await generateGeminiContent({
        contents: [filePart],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_WASTE_CODE_FORENSICS(targetCode),
          responseMimeType: "application/json",
          responseSchema: SAFEIWATCH_WASTE_CODE_AUDIT_SCHEMA,
          temperature: 0.1,
        },
      });

      const parsed = cleanAndParseJson(response);
      return normalizeAuditResult(parsed, "code", targetCode);
    }

    // Single photo waste-only verification
    const response = await generateGeminiContent({
      contents: [filePart],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_WASTE_FORENSICS,
        responseMimeType: "application/json",
        responseSchema: SAFEIWATCH_WASTE_AUDIT_SCHEMA,
        temperature: 0.1,
      },
    });

    const parsed = cleanAndParseJson(response);
    return normalizeAuditResult(parsed, "waste");
  } catch (error) {
    console.error("Error in wasteVerification:", error);
    throw error;
  }
};
