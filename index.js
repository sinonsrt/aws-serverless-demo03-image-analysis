const { get } = require('axios');

// aws -  sls invoke -f img-analysis --path request.json --log
// local - sls invoke local -f img-analysis --path request.json --log

class Handler {
  constructor({ rekoSvc, translatorSvc }) {
    this.rekoSvc = rekoSvc;
    this.translatorSvc = translatorSvc;
  }

  async main(event) {
    try {
      const { imageUrl } = event.queryStringParameters;

      console.log('Downloading image...');
      const buffer = await this.getImageBuffer(imageUrl);

      console.log('Detecting labels...');
      const { names, workingItems } = await this.detectImageLabels(buffer);

      console.log('Translating to portuguese..');
      const texts = await this.translateText(names);

      console.log('Handling final object...');
      const finalText = this.formatTextResults(texts, workingItems);

      console.log('Finishing...');

      return { statusCode: 200, body: `A imagem tem: ${finalText}` };
    } catch (error) {
      console.log('Error**', error.stack);
      return { statusCode: 500, body: 'Internal Server Error' };
    }
  }

  async getImageBuffer(imageUrl) {
    const response = await get(imageUrl, {
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response.data, 'base64');

    return buffer;
  }

  formatTextResults(texts, workingItems) {
    const finalText = [];

    for (const indexText in texts) {
      const namePortugueses = texts[indexText];
      const confidence = workingItems[indexText].Confidence;
      finalText.push(
        `${confidence.toFixed(2)}% de ser do tipo ${namePortugueses}`
      );
    }

    return finalText.join('\n');
  }

  async translateText(text) {
    const params = {
      SourceLanguageCode: 'en',
      TargetLanguageCode: 'pt',
      Text: text,
    };

    const { TranslatedText } = await this.translatorSvc
      .translateText(params)
      .promise();

    return TranslatedText.split(' e ');
  }

  async detectImageLabels(buffer) {
    const params = {
      Image: {
        Bytes: buffer,
      },
    };

    const result = await this.rekoSvc.detectLabels(params).promise();

    const workingItems = result.Labels.filter(
      ({ Confidence }) => Confidence > 80
    );

    const names = workingItems.map(({ Name }) => Name).join(' and ');

    return { names, workingItems };
  }
}

const aws = require('aws-sdk');
const reko = new aws.Rekognition();
const translator = new aws.Translate();
const handler = new Handler({
  rekoSvc: reko,
  translatorSvc: translator,
});

module.exports.main = async (event) => {
  return handler.main(event);
};
