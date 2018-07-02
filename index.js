const path = require('path');
const Koa = require('koa');
const logger = require('koa-logger');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');

const webpack = require('webpack');
const config = require('./webpack.config.dev');
const webpackMiddleware = require('koa-webpack');
const nunjucks = require('nunjucks');
const jetpack = require('fs-jetpack');
const inline = require('./middlewares/inline');
const app = new Koa();
const compiler = webpack(config);
//const nodeEnv = process.env.NODE_ENV || '';

const webpackDevOptions = {
  noInfo: true,
  historyApiFallback: true,
  publicPath: config.output.publicPath,
  headers: {
    'Access-Control-Allow-Origin': '*'
  }
};

var env = new nunjucks.Environment( //也就是起到了'koa-views'的作用
  new nunjucks.FileSystemLoader(
    [
      path.resolve(__dirname, 'views'),
      path.resolve(__dirname, 'views/results'),
      path.resolve(__dirname, 'views/results/ad-subscription')
    ],
    {
      watch:false,
      noCache: true
    }
  ),
  {autoescape: false}
);
env.addFilter('addSearchParam', (str, param) => {
  const hashIndex = str.indexOf('#');
  const hashStr = hashIndex > 0 ? str.substr(hashIndex) : '';
  const strWithOutHashStr = hashIndex > 0 ? str.substring(0, hashIndex) : str;
  
  if (strWithOutHashStr.includes('?')) {
    //去掉原有ccode
    const strWithOutHashStrWithOutCcode = strWithOutHashStr.replace(/ccode=[a-zA-Z0-9]+&?/,'');
    return `${strWithOutHashStrWithOutCcode}&${param}${hashStr}`;
  } 
  return `${strWithOutHashStr}?${param}${hashStr}`;
});

function render(template, context) {
  return new Promise(function(resolve, reject) {
    env.render(template, context, function(err, res) {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}
app.use(async (ctx,next) => {
  ctx.state.isProduction = process.env.NODE_ENV === 'production';
  console.log(ctx.state);
  await next(); //NOTE: koa中间件必须这样使用async, await
});
app.use(logger());
app.use(inline());
app.use(bodyParser());

app.use(webpackMiddleware({
  compiler: compiler,
  config: config,
  dev: webpackDevOptions,
  hot: compiler
}));

const router = new Router();

const manageRouter = new Router();
const resultRouter = new Router();
const dataApiRouter = new Router();
const postResultRouter = new Router();
//url参数可以为:adForNews

///management page router
manageRouter.get('/:name', async ctx => { //name为adForNews
  const chunkName = `manage_${ctx.params.name}`;
  const cssSource =ctx.state.isProduction ? `/${chunkName}.css`: `/static/${chunkName}.css`; 
  const jsSource = ctx.state.isProduction ? `/${chunkName}.js`: `/static/${chunkName}.js`; 
  ctx.body = await render('app.html', {
    demoName: 'FTC Ad Management System',
    isProduction: ctx.state.isProduction,
    cssSource: cssSource,
    jsSource: jsSource
  });
});

router.use('/manage', manageRouter.routes());
router.get('/', ctx => {//默认重定向
  ctx.redirect('/manage/adfornews');
});

///ad result showing router
resultRouter.get('/:name', async ctx => {
  const name = ctx.params.name;
  const chunkName = `result_${name}`;
  const cssSource = ctx.state.isProduction ? `/${chunkName}.css`: `/static/${chunkName}.css`; 
  const jsSource = ctx.state.isProduction ? `/${chunkName}.js`: `/static/${chunkName}.js`; 
  const adData = jetpack.read(`./server/data/ad-subscription/${name}.json`,'json');
 // console.log(adData);
  ctx.body = await render(`${name}.html`, Object.assign(
    adData,
    {
      isProduction: ctx.state.isProduction,
      cssSource:cssSource,
      jsSource:jsSource
    }
  ));
});
router.use('/result', resultRouter.routes()); //Nested routers 嵌套路由

//ad post router
dataApiRouter.post('/:name',  ctx => {
  const name = ctx.params.name;
  const data = ctx.request.body;
  data.adTitle = name;
  data.styleName = name;
  const jsonToWrite = JSON.stringify(data);
  jetpack.writeAsync(`./server/data/ad-subscription/${name}.json`, jsonToWrite);
  ctx.body = {
    'ok': true //如果提交Ajax不是默认行为，那么可以在button的onSubmit的事件监听函数的fetch post的回调函数判断是否提交成功
  }
  ctx.redirect(`/postresult/success/${name}`);
  //ctx.redirect('/adfornews');
  /** NOTE: ctx.redirect:
   * 同response.redirect, 执行 [302] 重定向到 url.
   * 字符串 “back” 是特别提供Referrer支持的，当Referrer不存在时，使用 alt 或“/”
   * 如果删去这句话，那么就直接得到/post路由，这个路由只是处理表单，却没有返回任何内容，所以会显示Not Found页面
   。
  */
});
dataApiRouter.get('/:name', ctx => {
  const name = ctx.params.name;
  ctx.body = jetpack.read(`./server/data/ad-subscription/${name}.json`,'json');
});
const delay = ms => new Promise(
  resolve => setTimeout(
    resolve,
    ms
  )
);
router.use('/data', dataApiRouter.routes());


postResultRouter.get('/success/:name', async ctx => {
  //ctx.body = '提交成功!';
  const name = ctx.params.name;
  const chunkName = 'postresult'
  const cssSource = ctx.state.isProduction ? `/${chunkName}.css`: `/static/${chunkName}.css`; 
  ctx.body = await render('postresult.html', {
    pageName: 'Post Success Page',
    resultName: name,
    isProduction: ctx.state.isProduction,
    cssSource: cssSource,
  });
}/*, async (ctx, next) => {
  console.log('go to next');
  await delay(2000);
  console.log('after delay');
  await next();
}, ctx => { //不起作用
  console.log('go to next 2');
  console.log(ctx);
  ctx.body = '新的页面';
  console.log(ctx);
  ctx.redirect('back');
}*/);
router.use('/postresult', postResultRouter.routes());

app.use(router.routes());

app.listen(5000, () => { //NOTE: 'listening'事件，Node的原生事件，在调用server.listen()后触发
  console.log('Listening 5000');
});