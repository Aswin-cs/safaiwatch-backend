import MarkedSpot from "../models/markedSpots.model.js";
import UserRewards from "../models/userRewards.model.js";
import UserStatus from "../models/userStatus.model.js";

const rewardsCalculating = async (userId, detailsOfCompletingTheSpot, which) => {
      const { markedSpotId } = detailsOfCompletingTheSpot;
      try {
            const spot = await MarkedSpot.findById(markedSpotId);
            if (!spot) {
                  return { success: false, message: "Spot not found" };
            }

            if (which === "completed") {
                  if (!spot.isCompleted) {
                        return { success: false, message: "Spot not completed yet" };
                  }
                  const completerId = userId;
                  if (spot.markedBy && spot.markedBy.toString() === completerId?.toString()) {
                        return { success: false, message: "You cannot complete your own spot" };
                  }

                  let karmaInc = 10;
                  let sellingInc = 10;
                  if (spot.critcal === "High" || spot.critcal === "Very High") {
                        karmaInc = 50;
                        sellingInc = 50;
                  } else if (spot.critcal === "Medium") {
                        karmaInc = 25;
                        sellingInc = 25;
                  }
                  else if (spot.critcal === "Low") {
                        karmaInc = 15;
                        sellingInc = 15;
                  }

                  await UserRewards.findOneAndUpdate(
                        { user: completerId },
                        { $inc: { karmaPoints: karmaInc, SellingPoints: sellingInc } },
                        { upsert: true, returnDocument: 'after' }
                  );
            } else if (which === "marked") {
                  let karmaInc = 5;
                  let sellingInc = 5;
                  if (spot.critcal === "High" || spot.critcal === "Very High") {
                        karmaInc = 20;
                        sellingInc = 20;
                  } else if (spot.critcal === "Medium") {
                        karmaInc = 10;
                        sellingInc = 10;
                  }
                  else if (spot.critcal === "Low") {
                        karmaInc = 5;
                        sellingInc = 5;
                  }

                  await UserRewards.findOneAndUpdate(
                        { user: spot.markedBy },
                        { $inc: { karmaPoints: karmaInc, SellingPoints: sellingInc } },
                        { upsert: true, returnDocument: 'after' }
                  );

            }

            return { success: true, message: "Rewards calculated successfully" };
      } catch (error) {
            console.error("Error in rewardsCalculating:", error);
            return { success: false, message: "Error calculating rewards" };
      }
};

const badgesCalculating = async (user) => {
      const userId = user?.user_id || user?._id || user?.id || user;
      try {
            let userRewards = await UserRewards.findOne({ user: userId });
            const userStatus = await UserStatus.findOne({ user: userId });
            if (!userRewards) {
                  userRewards = new UserRewards({ user: userId });
            }

            const markedCount = userStatus?.MarkedSpots?.length || 0;
            const assignedCount = userStatus?.AssignedSpots?.length || 0;
            const karmaPts = userRewards.karmaPoints || 0;

            const existingBadgeNames = (userRewards.badges || []).map((b) => (typeof b === "string" ? b : b.name));

            const BADGE_CONFIG = {
                  "The Beginner": { icon: "spa", type: "bronze", levelTag: "LV. 1", subtitle: "First Step", description: "Submitted your first verified civic spot report to kick off your sanitation journey." },
                  "The Explorer": { icon: "explore", type: "bronze", levelTag: "LV. 1", subtitle: "Spot Explorer", description: "Actively mapped and reported 10+ sanitation spots across your local ward." },
                  "The Spy": { icon: "visibility", type: "silver", levelTag: "LV. 2", subtitle: "Civic Spotter", description: "Kept a vigilant eye on unassigned neighborhood sanitation spots." },
                  "Eye of the eagle": { icon: "center_focus_strong", type: "silver", levelTag: "LV. 2", subtitle: "Precision Spotter", description: "Demonstrated high accuracy in spot location tagging and coordinator assignment." },
                  "The Hero": { icon: "shield", type: "silver", levelTag: "LV. 3", subtitle: "Ward Defender", description: "Earned 100+ Karma points by taking active responsibility for ward cleanliness." },
                  "The Icon": { icon: "workspace_premium", type: "gold", levelTag: "LV. 4", subtitle: "Community Leader", description: "A celebrated civic champion with 200+ Karma points in community service." },
                  "The King": { icon: "crown", type: "gold", levelTag: "LV. 5", subtitle: "Sanitation King", description: "Crowned Ward Champion with over 400 Karma points and 100+ spot contributions." },
                  "The Legend": { icon: "auto_awesome", type: "gold", levelTag: "MAX LV.", subtitle: "Civic Legend", description: "Achieved legendary status with 1000+ Karma points and supreme ward leadership." }
            };

            if (markedCount >= 5 && assignedCount <= 10 && !existingBadgeNames.includes("The Spy")) {
                  userRewards.badges.push({ name: "The Spy", dateEarned: new Date(), ...(BADGE_CONFIG["The Spy"] || {}) });
                  existingBadgeNames.push("The Spy");
            }
            if (markedCount >= 10 && assignedCount >= 10 && !existingBadgeNames.includes("Eye of the eagle")) {
                  userRewards.badges.push({ name: "Eye of the eagle", dateEarned: new Date(), ...(BADGE_CONFIG["Eye of the eagle"] || {}) });
                  existingBadgeNames.push("Eye of the eagle");
            }

            const badgeRules = [
                  [karmaPts >= 1000 || markedCount >= 200, "The Legend"],
                  [karmaPts >= 400 || markedCount >= 100, "The King"],
                  [karmaPts >= 200 || markedCount >= 50, "The Icon"],
                  [karmaPts >= 100 || markedCount >= 25, "The Hero"],
                  [karmaPts >= 25 || markedCount >= 10, "The Explorer"],
                  [markedCount >= 1, "The Beginner"],
            ];

            for (const [cond, name] of badgeRules) {
                  if (cond && !existingBadgeNames.includes(name)) {
                        userRewards.badges.push({ name, dateEarned: new Date(), ...(BADGE_CONFIG[name] || {}) });
                        existingBadgeNames.push(name);
                  }
            }

            await UserRewards.findOneAndUpdate(
                  { $or: [{ user: userId }, { userId }] },
                  { $set: { badges: userRewards.badges } },
                  { upsert: true, returnDocument: 'after' }
            );
            return { success: true, message: "Badges calculated successfully" };
      } catch (error) {
            console.error("Error in badgesCalculating:", error);
            return { success: false, message: "Error calculating badges" };
      }
};

const PriceList = [
      {
            category: "gift card",
            rewards: [
                  { name: "BookMyShow ₹100 Movie Pass", points: 400, description: "Valid on any movie ticket or event booking nationwide. Instant coupon code.", icon: "movie", badge: "POPULAR" },
                  { name: "Amazon Pay ₹250 Gift Voucher", points: 550, description: "Add ₹250 directly to your Amazon Pay wallet for shopping & bill payments.", icon: "shopping_cart", badge: "TRENDING" },
                  { name: "Amazon Gift Card", points: 1000, description: "Amazon ₹1,000 e-Gift Voucher redeemable across all products online.", icon: "card_giftcard", badge: "POPULAR" },
                  { name: "Flipkart Gift Card", points: 1000, description: "Flipkart ₹1,000 e-Gift Voucher redeemable on top brands.", icon: "shopping_bag" },
            ],
      },
      {
            category: "free meal",
            rewards: [
                  { name: "Organic Juice Bar Wellness Pass", points: 250, description: "Complimentary cold-pressed organic detox juice at participating health bars.", icon: "local_bar" },
                  { name: "Cafe Coffee Day Hot Beverage Pass", points: 300, description: "Free hot cappuccino or cold coffee pass redeemable at any CCD branch.", icon: "local_cafe" },
                  { name: "Swiggy ₹150 Gourmet Meal Pass", points: 350, description: "Enjoy ₹150 discount on any food delivery order across top city restaurants.", icon: "restaurant", badge: "BEST VALUE" },
                  { name: "Pizza", points: 500, description: "Complimentary gourmet pizza voucher at partner pizzerias.", icon: "local_pizza" },
                  { name: "Burger", points: 500, description: "Free delicious gourmet burger combo meal voucher.", icon: "lunch_dining" },
            ],
      },
      {
            category: "clothing",
            rewards: [
                  { name: "SafaiWatch Eco Cotton Tote Bag", points: 400, description: "Ultra-durable 100% recycled cotton tote bag with reinforced handles.", icon: "shopping_bag" },
                  { name: "Field Volunteer Reflective Cap", points: 450, description: "Breathable dark-green cotton cap with 3M reflective SafaiWatch emblem.", icon: "military_tech" },
                  { name: "Tshirt", points: 500, description: "Official SafaiWatch Volunteer 100% Organic Cotton T-Shirt.", icon: "checkroom", sizes: ["S", "M", "L", "XL"], badge: "LIMITED SWAG" },
                  { name: "Notebook", points: 500, description: "Eco-friendly Recycled Paper Civic Ranger Field Journal.", icon: "menu_book" },
                  { name: "Civic Ranger Embroidered Tee", points: 600, description: "Heavyweight 100% organic cotton tee with reflective Civic Ranger chest badge.", icon: "checkroom", sizes: ["S", "M", "L", "XL"], badge: "LIMITED SWAG" },
                  { name: "Mug", points: 1000, description: "SafaiWatch Premium Ceramic Coffee Mug with Civic Badge.", icon: "local_cafe" },
            ],
      },
];

const selectedRewards = async (user, rewardName, clothSize = null) => {
      const userId = user?.user_id || user?._id || user?.id || user;
      if (!userId) {
            return { success: false, message: "User not identified" };
      }

      let foundReward = null;
      for (const item of PriceList) {
            const match = item.rewards.find(
                  (r) => r.name.toLowerCase() === rewardName?.toString().toLowerCase().trim()
            );
            if (match) {
                  foundReward = { ...match, category: item.category };
                  break;
            }
      }

      if (!foundReward) {
            return { success: false, message: `Reward "${rewardName}" not found in catalogue` };
      }

      let userRewards = await UserRewards.findOne({ $or: [{ user: userId }, { userId }] });
      if (!userRewards) {
            userRewards = new UserRewards({ user: userId });
      }

      const availableBalance = userRewards.SellingPoints > 0 ? userRewards.SellingPoints : (userRewards.karmaPoints || 0);
      if (availableBalance < foundReward.points) {
            return {
                  success: false,
                  message: `Insufficient points. You need ${foundReward.points} points, but have ${availableBalance} points.`,
            };
      }

      if (foundReward.category === "clothing" && !clothSize) {
            return { success: false, message: "Cloth size (S, M, L, XL) is required for clothing rewards" };
      }

      if (foundReward.category === "clothing" && clothSize) {
            const validSizes = ["S", "M", "L", "XL"];
            if (!validSizes.includes(clothSize)) {
                  return { success: false, message: "Invalid cloth size. Valid options are S, M, L, XL" };
            }
      }

      // Deduct points
      userRewards.SellingPoints = Math.max(0, (userRewards.SellingPoints || userRewards.karmaPoints || 0) - foundReward.points);
      userRewards.karmaPoints = Math.max(0, (userRewards.karmaPoints || 0) - foundReward.points);

      const newClaim = {
            category: foundReward.category,
            name: foundReward.name,
            pointsSpent: foundReward.points,
            dateSelected: new Date(),
            clothSize: clothSize || undefined,
      };

      if (!Array.isArray(userRewards.selectedRewards)) {
            userRewards.selectedRewards = [];
      }
      userRewards.selectedRewards.unshift(newClaim);
      await userRewards.save();

      return {
            success: true,
            message: "Reward selected successfully",
            claimedReward: newClaim,
            userRewards: {
                  karmaBalance: userRewards.karmaPoints,
                  karmaPoints: userRewards.karmaPoints,
                  SellingPoints: userRewards.SellingPoints,
                  selectedRewards: userRewards.selectedRewards,
            },
      };
};

const leaderboardRankCalculated = async (user) => {
      try {
            const users = await UserRewards.find({}).sort({ karmaPoints: -1 });
            const updatePromises = users.map((u, index) =>
                  UserRewards.updateOne(
                        { _id: u._id },
                        { $set: { leaderboardRank: index + 1 } }
                  )
            );
            await Promise.all(updatePromises);
            return { success: true, message: "Leaderboard updated successfully" };
      } catch (error) {
            console.error("Error in leaderboardRankCalculated:", error);
            return { success: false, message: "Error calculating leaderboard rank" };
      }
};

const getYYYYMMDD = (d) => {
      if (!d) return "";
      const date = new Date(d);
      if (isNaN(date.getTime())) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
};

const streaksCalculated = async (user) => {
      const userId = user?.user_id || user?._id || user?.id || user;
      try {
            const [userStatus, userRewards, dbMarkedSpots, dbCompletedSpots] = await Promise.all([
                  UserStatus.findOne({ $or: [{ user: userId }, { userId }] }),
                  UserRewards.findOne({ $or: [{ user: userId }, { userId }] }),
                  MarkedSpot.find({ markedBy: userId }).select("markedAt createdAt"),
                  MarkedSpot.find({ "isCompletedBy.completedBy": userId }).select("isCompletedBy createdAt"),
            ]);

            let targetRewards = userRewards;
            if (!targetRewards) {
                  targetRewards = new UserRewards({ user: userId });
            }

            const activeDatesSet = new Set();

            // 1. Process activeDays from userRewards
            if (Array.isArray(targetRewards.activeDays)) {
                  targetRewards.activeDays.forEach((d) => {
                        const str = getYYYYMMDD(d);
                        if (str) activeDatesSet.add(str);
                  });
            }

            // 2. Process MarkedSpot records
            (dbMarkedSpots || []).forEach((s) => {
                  const dt = s.markedAt || s.createdAt;
                  const str = getYYYYMMDD(dt);
                  if (str) activeDatesSet.add(str);
            });

            // 3. Process CompletedSpot records
            (dbCompletedSpots || []).forEach((s) => {
                  if (Array.isArray(s.isCompletedBy)) {
                        s.isCompletedBy.forEach((c) => {
                              if (String(c.completedBy) === String(userId) && c.completedAt) {
                                    const str = getYYYYMMDD(c.completedAt);
                                    if (str) activeDatesSet.add(str);
                              }
                        });
                  }
            });

            // 4. Process UserStatus activity
            if (userStatus) {
                  if (userStatus.lastActiveAt) {
                        const str = getYYYYMMDD(userStatus.lastActiveAt);
                        if (str) activeDatesSet.add(str);
                  }
                  (userStatus.MarkedSpots || []).forEach((s) => {
                        const str = getYYYYMMDD(s?.markedAt);
                        if (str) activeDatesSet.add(str);
                  });
                  (userStatus.AssignedSpots || []).forEach((s) => {
                        const str = getYYYYMMDD(s?.assignedAt);
                        if (str) activeDatesSet.add(str);
                  });
                  (userStatus.CompletedSpots || []).forEach((s) => {
                        const str = getYYYYMMDD(s?.completedAt);
                        if (str) activeDatesSet.add(str);
                  });
            }

            const now = new Date();
            const todayStr = getYYYYMMDD(now);
            activeDatesSet.add(todayStr); // Register today's action

            // Convert set to array of sorted date strings (ascending)
            const sortedDates = Array.from(activeDatesSet).filter(Boolean).sort();

            // Calculate current streak backward from today
            let currentStreak = 0;
            let checkDate = new Date(now);

            while (true) {
                  const checkStr = getYYYYMMDD(checkDate);
                  if (activeDatesSet.has(checkStr)) {
                        currentStreak += 1;
                        checkDate.setDate(checkDate.getDate() - 1);
                  } else {
                        break;
                  }
            }

            // Calculate longest streak across history
            let longestStreak = 0;
            let tempStreak = 0;
            let prevTime = null;

            for (const dStr of sortedDates) {
                  const currTime = new Date(dStr).getTime();
                  if (prevTime === null) {
                        tempStreak = 1;
                  } else {
                        const diffDays = Math.round((currTime - prevTime) / (1000 * 3600 * 24));
                        if (diffDays === 1) {
                              tempStreak += 1;
                        } else if (diffDays > 1) {
                              tempStreak = 1;
                        }
                  }
                  prevTime = currTime;
                  if (tempStreak > longestStreak) {
                        longestStreak = tempStreak;
                  }
            }

            longestStreak = Math.max(longestStreak, targetRewards.longestStreak || 0, currentStreak);

            // Update userRewards atomically to prevent version collision
            await UserRewards.findOneAndUpdate(
                  { $or: [{ user: userId }, { userId }] },
                  {
                        $set: {
                              currentStreak,
                              longestStreak,
                              lastStreakDate: now,
                              activeDays: sortedDates.map((dStr) => new Date(`${dStr}T12:00:00.000Z`)),
                        }
                  },
                  { upsert: true, returnDocument: 'after' }
            );

            if (userStatus) {
                  await UserStatus.findOneAndUpdate(
                        { $or: [{ user: userId }, { userId }] },
                        {
                              $set: {
                                    streaks: currentStreak,
                                    lastActiveAt: now,
                              }
                        }
                  );
            }

            return {
                  success: true,
                  message: "Streaks calculated successfully",
                  currentStreak,
                  longestStreak,
                  totalActiveDays: sortedDates.length,
            };
      } catch (error) {
            console.error("Error in streaksCalculated:", error);
            return { success: false, message: "Error calculating streaks" };
      }
};

export {
      PriceList,
      rewardsCalculating,
      badgesCalculating,
      leaderboardRankCalculated,
      selectedRewards,
      streaksCalculated,
};
