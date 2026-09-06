import crypto from "crypto";

const generateOTP = async () => {
      return crypto.randomInt(100000, 999999).toString();
}

export { generateOTP };

