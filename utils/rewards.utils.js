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

                  await UserRewards.findOneAndUpdate(
                        { user: completerId },
                        { $inc: { karmaPoints: karmaInc, SellingPoints: sellingInc } },
                        { upsert: true, new: true }
                  );
            } else if (which === "marked") {
                  let karmaInc = 5;
                  let sellingInc = 5;
                  if (spot.critcal === "High" || spot.critcal === "Very High") {
                        karmaInc = 25;
                        sellingInc = 25;
                  } else if (spot.critcal === "Medium") {
                        karmaInc = 15;
                        sellingInc = 15;
                  }
                  else if (spot.critcal === "Low") {
                        karmaInc = 5;
                        sellingInc = 5;
                  }

                  await UserRewards.findOneAndUpdate(
                        { user: spot.markedBy },
                        { $inc: { karmaPoints: karmaInc, SellingPoints: sellingInc } },
                        { upsert: true, new: true }
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

            await userRewards.save();
            return { success: true, message: "Badges calculated successfully" };
      } catch (error) {
            console.error("Error in badgesCalculating:", error);
            return { success: false, message: "Error calculating badges" };
      }
};

const PriceList = [
      {
            category: "clothing",
            rewards: [
                  { name: "Tshirt", points: 500 },
                  { name: "Mug", points: 1000 },
                  { name: "Notebook", points: 500 },
            ],
      },
      {
            category: "gift card",
            rewards: [
                  { name: "Amazon Gift Card", points: 1000 },
                  { name: "Flipkart Gift Card", points: 1000 },
            ],
      },
      {
            category: "free meal",
            rewards: [
                  { name: "Pizza", points: 500 },
                  { name: "Burger", points: 500 },
            ],
      },
];

const selectedRewards = async (user, rewardName, clothSize = null) => {
      const userId = user?.user_id || user?._id || user?.id || user;

      let foundReward = null;
      for (const item of PriceList) {
            const match = item.rewards.find((r) => r.name === rewardName);
            if (match) {
                  foundReward = { ...match, category: item.category };
                  break;
            }
      }

      if (!foundReward) {
            return { success: false, message: "Reward not found" };
      }
      const userRewards = await UserRewards.findOne({ user: userId });
      if (!userRewards) {
            return { success: false, message: "User rewards not found" };
      }
      if (userRewards.karmaPoints < foundReward.points) {
            return { success: false, message: "Insufficient points" };
      }
      if (foundReward.category === "clothing" && !clothSize) {
            return { success: false, message: "Cloth size is required" };
      }
      userRewards.SellingPoints = (userRewards.SellingPoints || 0) - foundReward.points;
      userRewards.selectedRewards.push({
            category: foundReward.category,
            name: foundReward.name,
            pointsSpent: foundReward.points,
            dateSelected: new Date(),
            clothSize: clothSize,
      });
      await userRewards.save();
      return { success: true, message: "Reward selected successfully" };
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

const streaksCalculated = async (user) => {
      const userId = user?.user_id || user?._id || user?.id || user;
      try {
            const userStatus = await UserStatus.findOne({ user: userId });
            let userRewards = await UserRewards.findOne({ user: userId });
            if (!userRewards) {
                  userRewards = new UserRewards({ user: userId });
            }
            if (userStatus) {
                  const now = new Date();
                  const todayStr = now.toISOString().split('T')[0];

                  const lastActive = userStatus.lastActiveAt || userRewards.lastStreakDate;
                  const lastActiveStr = lastActive ? new Date(lastActive).toISOString().split('T')[0] : null;

                  if (!Array.isArray(userRewards.activeDays)) {
                        userRewards.activeDays = [];
                  }

                  const existingDateStrs = userRewards.activeDays.map((d) => d ? new Date(d).toISOString().split('T')[0] : '');
                  if (!existingDateStrs.includes(todayStr)) {
                        userRewards.activeDays.push(now);
                  }

                  if (!lastActiveStr) {
                        userRewards.currentStreak = 1;
                  } else if (lastActiveStr === todayStr) {
                        userRewards.currentStreak = Math.max(userRewards.currentStreak || 1, 1);
                  } else {
                        const yesterday = new Date(now);
                        yesterday.setDate(now.getDate() - 1);
                        const yesterdayStr = yesterday.toISOString().split('T')[0];

                        if (lastActiveStr === yesterdayStr) {
                              userRewards.currentStreak = (userRewards.currentStreak || 0) + 1;
                        } else {
                              userRewards.currentStreak = 1;
                        }
                  }

                  userRewards.longestStreak = Math.max(userRewards.longestStreak || 0, userRewards.currentStreak);
                  userRewards.lastStreakDate = now;
                  userStatus.streaks = userRewards.currentStreak;
                  userStatus.lastActiveAt = now;

                  await userRewards.save();
                  await userStatus.save();
            }
            return { success: true, message: "Streaks calculated successfully" };
      } catch (error) {
            console.error("Error in streaksCalculated:", error);
            return { success: false, message: "Error calculating streaks" };
      }
};

export {
      rewardsCalculating,
      badgesCalculating,
      leaderboardRankCalculated,
      selectedRewards,
      streaksCalculated,
};
