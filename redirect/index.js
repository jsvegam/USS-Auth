const AWS = require('aws-sdk');
const url = require('url');
const S3 = new AWS.S3();


exports.handler = async function(event) {
    try {
        
        // variable para recibir los query string
        
        let accessCode = event.queryStringParameters.code
        let state = event.queryStringParameters.state
        
        // query select S3 al archivo auth-endpoints.json alojado en el bucket
        const query = "SELECT r.url FROM s3object[*].endpoints[*] r WHERE r.state = '" + state + "';";
        
        // parametros necesarios para la consulta S3 sellect
        const params = {
            Bucket: 'auth-redirect-uss',
            Key: 'auth-endpoints.json',
            ExpressionType: 'SQL',
            Expression: query,
            InputSerialization: {
                JSON: {
                    Type: 'DOCUMENT',
                }
            },
            OutputSerialization: {
                JSON: {
                    RecordDelimiter: ','
                }
            }
            
        }
        
        // se recibe el registro retornado por la consulta
        var endPointResult = await getDataUsingS3Select(params);
        endPointResult = endPointResult[0].url

    
        // response redirect con la url y el query string code correspondiente
        const response = {
            statusCode: 301,
            headers: {
                Location: url.format({
                pathname: endPointResult,
                query: {
                        code: accessCode
                    }
                })
            }
        };
    
    
    return response;
        
        
    } catch (e) {
        console.log("error")
        throw new Error(`no se pudo obtener endpoint: ${e.message}`)
    }
}

// Funcion que ejecuta la consulta S3 select
const getDataUsingS3Select = async (params) => {
 
  return new Promise((resolve, reject) => {
    S3.selectObjectContent(params, (err, data) => {
      if (err) { reject(err); }

      if (!data) {
        reject('Objecto vacio');
      }

      // este es el array que recibe la data en bytes, luego se convertira a buffer
      const records = []

      // Evento stream
      data.Payload.on('data', (event) => {
        // Hay multiples events en el stream
        // si hay un registro de evento, hay data dentro del registro
        if (event.Records) {
          records.push(event.Records.Payload);
        }
      })
      .on('error', (err) => {
        reject(err);
      })
      .on('end', () => {
        // convierte el array de bytes dentro de un buffer
        // luego convierte a string
        let planetString = Buffer.concat(records).toString('utf8');

        // remueve caracteres innecesario
        planetString = planetString.replace(/\,$/, '');

        // añade dentro de un JSON array
        planetString = `[${planetString}]`;

        try {
          const planetData = JSON.parse(planetString);
          resolve(planetData);
        } catch (e) {
          reject(new Error(`no se puede convertir la data S3 a un JSON object. S3 Select Query: ${params.Expression}`));
        }
      });
    });
  })
}
