import { Type } from "@google/genai";
import { generateGeminiContent } from "../config/geminiConfig.js";
import cloudinary from "../config/cloudinaryConfig.js";
import { urlToGenerativePart } from "./urlToGenerativePart.utils.js";

export async function getImageFRomCLoudinary() {
      const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: 'gestures',   // folder path
            max_results: 10,
      });
      if (result) {
            console.log(result, "fffffffffffffffffffffffff");
      }
      if (!result?.resources || result.resources.length === 0) {
            throw new Error("No gesture reference images found in Cloudinary folder '/gestures'");
      }
      const randomImage = result.resources[Math.floor(Math.random() * result.resources.length)];
      return randomImage.secure_url || randomImage.url;
}
export const SYSTEM_INSTRUCTION_WITH_FORENSICS = `
You are the visual auditing and forensic inspection agent for SafaiWatch, a civic sanitation management platform.
Your objective is to evaluate a submitted report image (Image 2) against a target hand gesture reference icon (Image 1) and determine if the report is authentic, verified, and free of fraud.

Conduct a rigorous step-by-step audit across four distinct phases:

---

PHASE 1: DIGITAL FORENSICS & SYNTHETIC MEDIA DETECTION
Analyze Image 2 for signs of artificial generation, manipulation, or digital tampering.
1. AI/Synthetic Generation Artifacts:
   - Hands/Digits: Inspect for warped geometry, fused/extra fingers, missing knuckles, unnatural joint angles, or plastic/waxy skin textures.
   - Background Consistency: Look for nonsensical/hallucinated text on signs, floating or melted debris, inconsistent vanishing points, or signature generative AI depth-of-field blur.
   - Lighting/Shadows: Check for illumination directions on the hand that contradict background shadows or light sources.
2. Digital Edits & Compositing:
   - Cut-and-Paste Edges: Look for harsh outline halos, aliasing differences, or unnatural anti-aliasing borders around the foreground hand.
   - Noise & Grain Mismatch: Check if sensor noise/ISO grain in the foreground hand area differs from the background waste area.
   - Cloning & Screen Captures: Look for clone-stamp patch repetitions or screen moiré patterns (horizontal/vertical interference lines indicating a photo taken off a display).

RULE: If ANY synthetic generation, deepfake rendering, or digital editing is detected, set isAiOrEdited = true, set isFraudulent = true, set fraudReason = "AI_GENERATED_OR_EDITED", and document the exact visual anomaly in forensicDetails.

---

PHASE 2: GESTURE VERIFICATION & POSITIONAL AUDIT
Compare the hand gesture in the foreground of Image 2 directly against the target gesture guide in Image 1.
1. Pose Alignment: Verify that the finger extension, thumb placement, and palm orientation in Image 2 match the structural pose in Image 1.
2. Physical Presence: Confirm that the hand is a real, physical hand positioned live in front of the camera lens, rather than a sticker, printout, or 2D image overlay.
3. Obscured Gestures: If the hand is cut off by the frame boundary, severely motion-blurred, or too dark to distinguish finger positions, mark the gesture as unverified.

RULE: If the hand gesture in Image 2 does not match Image 1, or is missing/unclear, set gestureMatched = false, set isFraudulent = true, and set fraudReason = "GESTURE_MISMATCH".

---

PHASE 3: MUNICIPAL WASTE SITE VERIFICATION
Evaluate the background of Image 2 to confirm a legitimate civic waste incident.
1. Outdoor/Public Context: Confirm the scene is in a municipal, public, or outdoor space (e.g., street, sidewalk, public park, vacant lot, gutter, public drainage).
2. Waste Identification: Verify the presence of real physical garbage, litter piles, overflowing dumpsters, plastic waste, organic waste, or construction debris.
3. Indoor/Irrelevant Rejection: Flag clean indoor home environments, private room interiors, organized personal spaces, or non-waste objects.

RULE: If Image 2 lacks real outdoor waste or shows a non-waste scene, set isValidWasteReport = false, set isFraudulent = true, and set fraudReason = "NO_WASTE_DETECTED".


OUTPUT DIRECTIVE:
Provide your final verdict strictly matching the required JSON schema. Maintain deterministic, objective, and strict evaluation standards to protect SafaiWatch platform integrity.
`;
export const SAFEIWATCH_AUDIT_SCHEMA = {
      type: Type.OBJECT,
      properties: {
            // ==========================================
            // PHASE 1: DIGITAL FORENSICS & EDIT DETECTION
            // ==========================================
            isAiOrEdited: {
                  type: Type.BOOLEAN,
                  description: "True if synthetic rendering, deepfake artifacts, digital compositing, or photo-editing is detected."
            },
            forensicConfidence: {
                  type: Type.NUMBER,
                  description: "Confidence score between 0.00 and 1.00 for the forensic analysis authenticity rating."
            },
            detectedManipulationType: {
                  type: Type.STRING,
                  enum: ["AI_GENERATED", "DIGITAL_COMPOSITE_EDIT", "SCREENSHOT", "AUTHENTIC_PHOTO"],
                  description: "Primary forensic classification of the uploaded image."
            },
            forensicDetails: {
                  type: Type.STRING,
                  description: "Detailed description of observed forensic anomalies (e.g., fused digits, lighting inconsistencies, moiré lines, cut-and-paste halos)."
            },

            // ==========================================
            // PHASE 2: GESTURE VERIFICATION
            // ==========================================
            gestureMatched: {
                  type: Type.BOOLEAN,
                  description: "True strictly if the foreground hand gesture in Image 2 matches the target gesture guide in Image 1."
            },
            detectedGestureName: {
                  type: Type.STRING,
                  description: "Name or description of the hand gesture observed in Image 2 (e.g. PEACE, THUMBS_UP, UNKNOWN)."
            },

            // ==========================================
            // PHASE 3: MUNICIPAL WASTE SITE VERIFICATION
            // ==========================================
            isValidWasteReport: {
                  type: Type.BOOLEAN,
                  description: "True ONLY if real outdoor municipal waste is present in a public setting."
            },

            // ==========================================
            // OVERALL AUDIT VERDICT & REASONING
            // ==========================================
            isFraudulent: {
                  type: Type.BOOLEAN,
                  description: "True if isAiOrEdited is true, gesture mismatch occurs, or no outdoor waste is present."
            },
            fraudReason: {
                  type: Type.STRING,
                  enum: ["AI_GENERATED_OR_EDITED", "GESTURE_MISMATCH", "SCREENSHOT", "NO_WASTE_DETECTED", "NONE"],
                  description: "Primary failure code if flagged as fraudulent."
            },
            summary: {
                  type: Type.STRING,
                  description: "Concise 1-2 sentence description summarizing the visual audit outcome."
            }
      },
      required: [
            "isAiOrEdited",
            "forensicConfidence",
            "detectedManipulationType",
            "forensicDetails",
            "gestureMatched",
            "detectedGestureName",
            "isValidWasteReport",
            "isFraudulent",
            "fraudReason",
            "summary"
      ]
};
export const aiPhotoVerification = async (input, mimeTypeParam) => {
      let fileInput;
      let mimeType;

      if (typeof input === "object" && !Buffer.isBuffer(input) && (input.fileBuffer || input.fileInput || input.url)) {
            fileInput = input.fileBuffer || input.fileInput || input.url;
            mimeType = input.mimeType || mimeTypeParam;
      } else {
            fileInput = input;
            mimeType = mimeTypeParam;
      }

      try {
            const remoteImageUrl = await getImageFRomCLoudinary();
            const randomRemoteImage = await urlToGenerativePart(remoteImageUrl);
            const filePart = await urlToGenerativePart(fileInput, mimeType);
            const response = await generateGeminiContent({
                  contents: [filePart, randomRemoteImage],
                  config: {
                        systemInstruction: SYSTEM_INSTRUCTION_WITH_FORENSICS,
                        responseMimeType: "application/json",
                        responseSchema: SAFEIWATCH_AUDIT_SCHEMA,
                        temperature: 0.1,
                  }
            });
            let auditResult = response;
            if (typeof auditResult === "string") {
                  try {
                        auditResult = JSON.parse(auditResult);
                  } catch (e) {
                        console.log("Error in aiPhotoVerification:", e);
                        // fallback to raw response if parsing fails
                  }
            }
            return auditResult;
      } catch (error) {
            console.error("Error in aiPhotoVerification:", error);
            throw error;
      }
};