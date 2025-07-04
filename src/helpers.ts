import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from "openai";
import axios from 'axios';
import * as fs from 'fs';


dotenv.config();

// Initialize Supabase client
const supabaseUrl:string = process.env.SUPABASE_URL as string;
const supabaseKey:string = process.env.SUPABASE_ANON_KEY as string;
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
    
    const descriptions: string[] = [];
    
    randomAds.forEach((ad, index) => {
      if (ad.facebook_ad_image_links && ad.facebook_ad_image_links.length > 0) {
        ad.facebook_ad_image_links.forEach((link, imgIndex) => {
          const adImage = link.ad_images as any;
          if (adImage?.detailed_description) {
            descriptions.push(adImage.detailed_description);
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

export async function generateImage(prompt: string, slackMessage = "Here is your generated image:") {
  const openai = new OpenAI();
  const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1, // Number of images (1-10)
      quality: "auto", // "high", "medium", "low", or "auto"
      size: "1024x1024"
  });

  // Save the image to a file
  if (!result.data || result.data.length === 0) {
    throw new Error('No image data received from OpenAI');
  }
  
  const image_base64 = result.data[0].b64_json;
  sendImageToSlack(image_base64, slackMessage);
  console.log("returning generated image")
  return image_base64; 
}

// Updated function to send base64 image to Slack using modern API
export async function sendImageToSlack(base64Image, message = 'Here is your generated image:', channelId = null) {
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
    
    const uploadUrlResponse = await axios.post('https://slack.com/api/files.getUploadURLExternal', formData, {
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const uploadUrlResult = uploadUrlResponse.data;
    
    if (!uploadUrlResult.ok) {
      throw new Error(`Slack API error getting upload URL: ${uploadUrlResult.error}`);
    }
    
    // Step 2: Upload file to the URL (raw bytes)
    await axios.post(uploadUrlResult.upload_url, imageBuffer);
        
    // Step 3: Complete the upload - Use form-encoded data
    const completeFormData = new URLSearchParams();
    console.log("---------------start 3---------------")
    completeFormData.append('files', JSON.stringify([{
      id: uploadUrlResult.file_id,
      title: 'Generated Image'
    }]));
    console.log("---------------end 3---------------")
    completeFormData.append('channel_id', defaultChannel);
    completeFormData.append('initial_comment', message);
    
    const completeResponse = await axios.post('https://slack.com/api/files.completeUploadExternal', completeFormData, {
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const completeResult = completeResponse.data;
    
    if (!completeResult.ok) {
      throw new Error(`Slack API error completing upload: ${completeResult.error}`);
    }
  
    return completeResult;
    
  } catch (error: any) {
    console.error('Error sending image to Slack:', error.message);
    if (axios.isAxiosError(error) && error.response) {
        console.error('Slack API response error data:', error.response.data);
    }
    throw error;
  }
}

export async function uploadAdToAPI(mergedAdData: any, image_base64: string) {
  const image = ("data:image/png;base64," + image_base64)
  const requestBody = {
    "final": true,
    "ad": {
      "name": "test", 
      "brandId": "89e227c9-0649-4321-bdaa-373fdf9c9c8b",
      "poolId": "5233bb61-3165-483a-bec6-de02ab86dbc2",
      "description": "test", 
      "websiteFooter": "test", 
      "titleFooter": "test",
      "descriptionFooter": "This is the footer description",
      "tags": ["ai-generated"],
      "ctaFooter": "Learn More"
    },
    "width": mergedAdData.width, 
    "height": mergedAdData.height, 
    "sourceImage": image, 
    "layers": mergedAdData.layers 
  };

  console.log("sending upload")

  try {
    console.log("---------------start 2---------------")
    const response = await axios.post('https://functions.uplane.com/api/image-gen', requestBody, {
      headers: {
        'Authorization': 'Bearer gdTolLM7Hi6EkexA7K6FQPw6i5yay6cJdZ5oJf0RaldAjjYYGAJx8TwTasOc08eq',
        'Content-Type': 'application/json'
      }
    });
    console.log("---------------end 2---------------")
    
    const result = response.data;
    console.log('Upload successful:', result);
    return result;
  } catch (error: any) {
    console.error('Error uploading ad:', error.message);
    if (axios.isAxiosError(error) && error.response) {
        console.log('Error response:', error.response.data);
        throw new Error(`HTTP error! status: ${error.response.status}`);
    }
    throw error;
  }
}

export async function returnEditorAd(mergedAdData: any, image_base64: string, slackMessage = "Here is your editor image:") {
  const image = ("data:image/png;base64," + image_base64)
  const requestBody = {
    "final": false, 
    "ad": {
      "name": "test", 
      "brandId": "89e227c9-0649-4321-bdaa-373fdf9c9c8b",
      "poolId": "5233bb61-3165-483a-bec6-de02ab86dbc2",
      "description": "test",
      "websiteFooter": "test",
      "titleFooter": "test",
      "descriptionFooter": "This is the footer description",
      "tags": ["ai-generated"],
      "ctaFooter": "Learn More"
    },
    "width": mergedAdData.width, 
    "height": mergedAdData.height, 
    "sourceImage": image, 
    "layers": mergedAdData.layers 
  };

  fs.writeFileSync('requestBody.txt', JSON.stringify(requestBody, null, 2));

  try {
    console.log("---------------start 1---------------")
    const response = await axios.post('https://functions.uplane.com/api/image-gen', requestBody, {
      headers: {
        'Authorization': 'Bearer gdTolLM7Hi6EkexA7K6FQPw6i5yay6cJdZ5oJf0RaldAjjYYGAJx8TwTasOc08eq',
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer' 
    });
    console.log("---------------end 1---------------")

    const imageBuffer = response.data; 
    const base64String = Buffer.from(imageBuffer).toString('base64');
    
    if (base64String) {
        await sendImageToSlack(base64String, slackMessage);
    } else {
        console.warn("No image data found in API response to send to Slack.");
    }
    
    console.log('Editor ad image received and processed.');
    return base64String; 

  } catch (error: any) {
    console.error('Error fetching editor ad:', error.message);
    if (axios.isAxiosError(error) && error.response) {
        let errorData = error.response.data;
        if (errorData instanceof ArrayBuffer) {
            try {
                errorData = Buffer.from(errorData).toString('utf-8');
            } catch (decodingError) {
                errorData = 'Could not decode ArrayBuffer error response.';
            }
        }
        console.log('Error response:', errorData);
        throw new Error(`HTTP error! status: ${error.response.status}`);
    }
    throw error;
  }
}

export function sanitizeJsonContent(content: string): string {
  content = content.trim();
  content = content.replace(/```json\s*|```\s*/g, '');
  content = content.replace(/'/g, '"');
  content = content.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  return content;
}