import mongoose from "mongoose";
export const feedsSchema = new mongoose.Schema({
      postName: {
            type: String,
            required: true
      },
      SpotedUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
      },
      CleanedUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
      },
      description: {
            type: String,
            required: true
      },
      imageBefore: {
            type: String,
            required: true
      },
      imageAfter: {
            type: String,
            required: true
      },
      geolocation: {
            type: {
                  type: String,
                  enum: ['Point'],
                  required: true
            },
            address: {
                  type: String,
                  required: true
            },
            coordinates: {
                  type: [Number],
                  required: true
            }
      },
      likeCount: {
            type: Number,
            default: 0
      },
      createdAt: {
            type: Date,
            default: Date.now
      }



});

export default mongoose.model("Post", feedsSchema) || mongoose.models.Post;