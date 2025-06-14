import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function getCompanyName(companyId) {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('name')
      .eq('company_id', companyId)
      .single(); // Add .single() to get one record instead of array

    if (error) {
      console.error('Error fetching company name:', error);
      return null;
    }

    return(data.name);
  } catch (error) {
    console.error('Error in getCompanyName:', error);
    return null;
  }
}

export async function getTopAdsByReach(companyId) {
  try {
    const { data, error } = await supabase
      .from('facebook_ads')
      .select(`
        meta_ad_id,
        eu_total_reach,
        delivery_start_time,
        delivery_stop_time,
        status,
        media_type,
        facebook_pages!inner(
          page_name,
          company_id
        ),
        facebook_ad_image_links(
          ad_images(
            detailed_description,
            image_url
          )
        )
      `)
      .eq('facebook_pages.company_id', companyId)
      .not('eu_total_reach', 'is', null)
      .order('eu_total_reach', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('Error fetching Facebook ads:', error);
      return [];
    }
    
    if (!data || data.length === 0) {
      console.log(`No Facebook ads found for company ID: ${companyId}`);
      return [];
    }

    // Randomly select 20 ads from the fetched data
    const shuffled = [...data].sort(() => 0.5 - Math.random());
    const randomAds = shuffled.slice(0, Math.min(20, data.length));
    
    const descriptions = [];
    
    randomAds.forEach((ad, index) => {
      
      if (ad.facebook_ad_image_links && ad.facebook_ad_image_links.length > 0) {
        ad.facebook_ad_image_links.forEach((link, imgIndex) => {
          if (link.ad_images?.detailed_description) {
            descriptions.push(link.ad_images.detailed_description);
          }
        });
      }
    });
    
    console.log("Anzahl example ads:" + descriptions.length);
    return descriptions;
    
  } catch (err) {
    console.error('Unexpected error:', err);
    return [];
  }
}

export async function generateImage(prompt) {
  const openai = new OpenAI();

  const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1, // Number of images (1-10)
      quality: "auto", // "high", "medium", "low", or "auto"
      size: "1024x1024",
  });

  // Save the image to a file
  const image_base64 = result.data[0].b64_json;
  sendImageToSlack(image_base64);
  return JSON.stringify(image_base64)
}

// Updated function to send base64 image to Slack using modern API
async function sendImageToSlack(base64Image, message = 'Here is your generated image:', channelId = null) {
  try {
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const defaultChannel = process.env.SLACK_CHANNEL_ID || channelId;
    
    if (!slackToken) {
      throw new Error('SLACK_BOT_TOKEN environment variable is required');
    }
    
    if (!defaultChannel) {
      throw new Error('SLACK_CHANNEL_ID environment variable or channelId parameter is required');
    }

    // Remove data URL prefix if present
    let cleanBase64 = base64Image;
    if (base64Image.startsWith('data:image/')) {
      cleanBase64 = base64Image.split(',')[1];
    }
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(cleanBase64, 'base64');
    const filename = 'generated-image.png';
    const filesize = imageBuffer.length;
    
    console.log(`Uploading image: ${filename}, size: ${filesize} bytes`);
    
    // Step 1: Get upload URL - Use form-encoded data as per Slack API docs
    const formData = new URLSearchParams();
    formData.append('filename', filename);
    formData.append('length', filesize.toString());
    
    const uploadUrlResponse = await fetch('https://slack.com/api/files.getUploadURLExternal', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
    
    const uploadUrlResult = await uploadUrlResponse.json();
    
    if (!uploadUrlResult.ok) {
      throw new Error(`Slack API error getting upload URL: ${uploadUrlResult.error}`);
    }
    
    // Step 2: Upload file to the URL (raw bytes)
    const uploadResponse = await fetch(uploadUrlResult.upload_url, {
      method: 'POST',
      body: imageBuffer
    });
    
    
    if (!uploadResponse.ok) {
      throw new Error(`File upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
    
    // Step 3: Complete the upload - Use form-encoded data
    const completeFormData = new URLSearchParams();
    completeFormData.append('files', JSON.stringify([{
      id: uploadUrlResult.file_id,
      title: 'Generated Image'
    }]));
    completeFormData.append('channel_id', defaultChannel);
    completeFormData.append('initial_comment', message);
    
    const completeResponse = await fetch('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: completeFormData
    });
    
    const completeResult = await completeResponse.json();
    
    if (!completeResult.ok) {
      throw new Error(`Slack API error completing upload: ${completeResult.error}`);
    }
  
    return completeResult;
    
  } catch (error) {
    console.error('Error sending image to Slack:', error);
    throw error;
  }
}

export async function uploadAdToAPI(structuredAnswer, image_base64) {
  const requestBody = {
    "final": true,
    "ad": {
      "name": "test", // Using "test" for Text-Generator values
      "brandId": "89e227c9-0649-4321-bdaa-373fdf9c9c8b",
      "poolId": "5233bb61-3165-483a-bec6-de02ab86dbc2",
      "description": "test", // Using "test" for Text-Generator values
      "websiteFooter": "test", // Using "test" for Text-Generator values
      "titleFooter": "test", // Using "test" for Text-Generator values
      "tags": ["ai-generated"],
      "ctaFooter": "Learn More"
    },
    "width": structuredAnswer.width, // From Image-Description-Generator JSON
    "height": structuredAnswer.height, // From Image-Description-Generator JSON
    "sourceImage": "data:image/png;base64," + image_base64, // Left empty as requested
    "layers": structuredAnswer.layers // From Image-Description-Generator JSON
  };

  
  try {
    const response = await fetch('https://functions.uplane.com/api/image-gen', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer gdTolLM7Hi6EkexA7K6FQPw6i5yay6cJdZ5oJf0RaldAjjYYGAJx8TwTasOc08eq',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Upload successful:', result);
    return result;
  } catch (error) {
    console.error('Error uploading ad:', error);
    throw error;
  }
}