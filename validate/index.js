const AWS = require('aws-sdk');
const url = require('url')
var ssm = new AWS.SSM();
const jsonQuery = require('json-query')
const request = require("request");
const graph = require('./graph');


exports.handler = async (event, context) => {
    // Variable utilizadas para recibir el body parameter
    // x-www-form-urlencoded, parameter code
    let accessCode;
    try {
        accessCode = (event["body"]).replace('code=','');
    } catch (e) {
        accessCode = null;
    }
    
    
    // Objeto necesario para generar el response
    var response = {
        statusCode: 200,
        data: "",
        error: "",
        error_desc: ""
    };
    
    // Valida el ingreso del body parameter code, si este no existe no se ejecuta nada
    if(!accessCode || accessCode == ''){
        response.data = null;
        response.error = "missing_data";
        return response;
    }
    
    // nombre de parametros almacenados en AWS Parameter Store
    var appParams = {
        appID: '/app-o365/prod/app-id',
        appSecret: '/app-o365/prod/app-secret',
        appRedirect: '/app-o365/prod/app-redirect',
    };
    
    
    // endpoint microsoft
    const endpoint = 'https://login.microsoftonline.com/common/oauth2/token';
    
    // recibe data desde AWS parameter store respecto al array enviado
    const data = await ssm.getParameters({
        Names: [appParams.appID, appParams.appSecret, appParams.appRedirect]
    }).promise();
    
    // se extrae lo necesario de lo devuelto desde paraemeter store, solo se necesita la propiedad value
    var appID = queryJson(data, appParams.appID);
    var appSecret = queryJson(data, appParams.appSecret);
    var appRedirect = queryJson(data, appParams.appRedirect);
    
    // parametros necesarios para el endpoint de microsoft
    const requestParams = {
        grant_type: "authorization_code",
        client_id: appID,
        client_secret: appSecret,
        resource: "https://graph.microsoft.com/",
        code: accessCode,
        scope: "user.read",
        redirect_uri: appRedirect
    };
    
    // si existe acceso code se consume el endpoint como promesa pra luego trabajar en base a la respuesta
    if(accessCode){

        const promise = new Promise(function(resolve, reject) {
                request.post({url:endpoint, form: requestParams}, async function(err,httpResponse,body){
                    if(err)
                    {
                        reject(err);
                    }
                    else
                    {
                        let parsedBody = JSON.parse(body);
                        resolve(parsedBody);
                    }
                });
        });
        
        // recepcion de la respuesta
        const body = await promise;
        
        // if condicionados al tipo de repuesta si hay token se ejecuta graph.getUserDetails para obtener datos desde O365
        if (body.error_description)
        {
            response.statusCode = 200;
            response.data = null;
            response.error = `${accessCode} Token_expired`;
            response.error_desc = body.error_description;
            
            return response;
            
        }else if(body.access_token){
            
            // respuesta exitosa
            response.statusCode = 200;
            response.data = await graph.getUserDetails(body.access_token);
            
            return response; 
        }
        
    }else{
        
        // response en caso de no existir accesscode necesario para el procesor
        response.statusCode = 200;
        response.data = null;
        response.error = "missing_data";
        return response;
    }
};


// funcion que permite extraer solo la propiedad Value de lo retorna por AWS Parameter Store, en base al filtro
function queryJson(obj, filter)
{
    
    var result = jsonQuery('Parameters[Name=' + filter + '].Value', {
      data: obj
    });
    
    return result.value;
}
