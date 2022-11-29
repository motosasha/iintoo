/* global exports process console __dirname Buffer */
'use strict';

const {series, parallel, src, dest, watch, lastRun} = require('gulp');
const atImport              = require("postcss-import");
const autoprefixer          = require("autoprefixer");
const browserSync           = require('browser-sync').create();
const cheerio               = require('gulp-cheerio');
const csso                  = require('gulp-csso');
const debug                 = require('gulp-debug');
const del                   = require('del');
const fs                    = require('fs');
const getClassesFromHtml    = require('get-classes-from-html');
const ghPages               = require('gh-pages');
const inlineSVG             = require('postcss-inline-svg');
const mqpacker              = require("css-mqpacker");
const path                  = require('path');
const plumber               = require('gulp-plumber');
const postcss               = require('gulp-postcss');
const prettyHtml            = require('gulp-pretty-html');
const pug                   = require('gulp-pug');
const rename                = require('gulp-rename');
const sass                  = require('gulp-sass')(require('sass'));
const svgstore              = require('gulp-svgstore');
const svgmin                = require('gulp-svgmin');
const through2              = require('through2');

// Глобальные настройки
const idm = {};
idm.config = require('./config.js');
idm.blocksFromHtml = Object.create(idm.config.alwaysAddBlocks); // блоки из конфига сразу добавим в список блоков
idm.scssImportsList = []; // список импортов стилей
const dir = idm.config.source;

// Сообщение для компилируемых файлов
let doNotEditMsg = '\n ВНИМАНИЕ! Этот файл генерируется автоматически.\n\n';

// Настройки бьютификатора
let prettyOption = {
	indent_with_tabs: '-s',
	indent_inner_html: true,
	extra_liners: ['body'],
	unformatted: ['code', 'em', 'strong', 'span', 'i', 'b', 'br', 'script'],
	content_unformatted: [],
};

// Список и настройки плагинов postCSS
let postCssPlugins = [
	autoprefixer({grid: true}),
	mqpacker({
		sort: true
	}),
	atImport(),
	inlineSVG()
];

function writePugMixinsFile(cb) {
	let allBlocksWithPugFiles = getDirectories('pug');
	let pugMixins = '//-' + doNotEditMsg.replace(/\n /gm,'\n  ');
	allBlocksWithPugFiles.forEach(function(blockName) {
		pugMixins += `include ${dir.blocks.replace(dir.dev,'../')}${blockName}/${blockName}.pug\n`;
	});
	fs.writeFileSync(`${dir.dev}pug/mixins.pug`, pugMixins);
	cb();
}
exports.writePugMixinsFile = writePugMixinsFile;

function compilePug() {
	const fileList = [
		`${dir.dev}pages/**/*.pug`
	];
	return src(fileList)
		.pipe(plumber({
			errorHandler: function (err) {
				console.log(err.message);
				this.emit('end');
			}
		}))
		.pipe(debug({title: 'Compiles '}))
		.pipe(pug({}))
		.pipe(prettyHtml(prettyOption))
		.pipe(through2.obj(getClassesToBlocksList))
		.pipe(dest(dir.build));
}
exports.compilePug = compilePug;

function compilePugFast() {
	const fileList = [
		`${dir.dev}pages/**/*.pug`
	];
	return src(fileList, { since: lastRun(compilePugFast) })
		.pipe(plumber({
			errorHandler: function (err) {
				console.log(err.message);
				this.emit('end');
			}
		}))
		.pipe(debug({title: 'Compiles '}))
		.pipe(pug({}))
		.pipe(prettyHtml(prettyOption))
		.pipe(through2.obj(getClassesToBlocksList))
		.pipe(dest(dir.build));
}
exports.compilePugFast = compilePugFast;

function writeSassImportsFile(cb) {
	const newScssImportsList = [];
	idm.config.addStyleBefore.forEach(function(src) {
		newScssImportsList.push(src);
	});
	idm.config.alwaysAddBlocks.forEach(function(blockName) {
		if (fileExist(`${dir.blocks}${blockName}/${blockName}.scss`)) newScssImportsList.push(`${dir.blocks}${blockName}/${blockName}.scss`);
	});
	let allBlocksWithScssFiles = getDirectories('scss');
	allBlocksWithScssFiles.forEach(function(blockWithScssFile){
		let url = `${dir.blocks}${blockWithScssFile}/${blockWithScssFile}.scss`;
		if (idm.blocksFromHtml.indexOf(blockWithScssFile) === -1) return;
		if (newScssImportsList.indexOf(url) > -1) return;
		newScssImportsList.push(url);
	});
	idm.config.addStyleAfter.forEach(function(src) {
		newScssImportsList.push(src);
	});
	let diff = getArraysDiff(newScssImportsList, idm.scssImportsList);
	if (diff.length) {
		let msg = `\n/*!*${doNotEditMsg.replace(/\n /gm,'\n * ').replace(/\n\n$/,'\n */\n\n')}`;
		let styleImports = msg;
		newScssImportsList.forEach(function(src) {
			styleImports += `@import "${src}";\n`;
		});
		styleImports += msg;
		fs.writeFileSync(`${dir.dev}scss/style.scss`, styleImports);
		console.log('---------- Write new style.scss');
		idm.scssImportsList = newScssImportsList;
	}
	cb();
}
exports.writeSassImportsFile = writeSassImportsFile;

function compileSass() {
	const fileList = [
		`${dir.dev}scss/style.scss`,
	];
	return src(fileList, { sourcemaps: true })
		.pipe(plumber({
			errorHandler: function (err) {
				console.log(err.message);
				this.emit('end');
			}
		}))
		.pipe(debug({title: 'Compiles:'}))
		.pipe(sass({includePaths: [__dirname+'/','node_modules']}))
		.pipe(postcss(postCssPlugins))
		.pipe(csso({
			restructure: false,
		}))
		.pipe(dest(`${dir.build}/css`, { sourcemaps: '.' }))
		.pipe(browserSync.stream());
}
exports.compileSass = compileSass;

function copyImg(cb) {
	let imgPath = `${dir.dev}img/`;
	if(fileExist(imgPath)) {
		return src(imgPath + '**/*.*')
			.pipe(dest(`${dir.build}img/`))
	}
	else {
		cb();
	}
}
exports.copyImg = copyImg;

function generateSvgSprite(cb) {
	let spriteSvgPath = `${dir.dev}symbols/`;
	if(fileExist(spriteSvgPath)) {
		return src(spriteSvgPath + '*.svg')
			.pipe(plumber({
				errorHandler: function (err) {
					console.log(err.message);
					this.emit('end');
				}
			}))
			.pipe(svgmin(function () {
				//return { plugins: [{ cleanupIDs: { minify: true } }] }
			}))
			.pipe(svgstore({ inlineSvg: true }))
			.pipe(cheerio({
				parserOptions: { xmlMode: true }
			}))
			.pipe(rename('svgSprite.svg'))
			.pipe(dest(`${dir.build}img/`));
	}
	else {
		cb();
	}
}
exports.generateSvgSprite = generateSvgSprite;

function copyFonts(cb) {
	let fontsPath = `${dir.dev}fonts/`;
	if(fileExist(fontsPath)) {
		return src(fontsPath + '**/*.*')
			.pipe(dest(`${dir.build}/fonts/`))
	}
	else {
		cb();
	}
}
exports.copyFonts = copyFonts;

function clearBuildDir() {
	return del([
		`${dir.build}**/*`
	]);
}
exports.clearBuildDir = clearBuildDir;

function reload(done) {
	browserSync.reload();
	done();
}

function deploy(cb) {
	ghPages.publish(path.join(process.cwd(), './build'), cb);
}
exports.deploy = deploy;

function serve() {
	browserSync.init({
		server: dir.build,
		host: '192.168.1.39',
		logPrefix: "dev-server",
		port: 3000,
		startPath: 'index.html',
		open: false,
		notify: false,
	});

	// Страницы: изменение, добавление
	watch([`${dir.dev}pages/**/*.pug`], { events: ['change', 'add'], delay: 100 }, series(
		compilePugFast,
		parallel(writeSassImportsFile),
		parallel(compileSass),
		reload
	));

	// Страницы: удаление
	watch([`${dir.dev}pages/**/*.pug`], { delay: 100 })
		.on('unlink', function(path) {
			let filePathInBuildDir = path.replace(`${dir.dev}pages/`, dir.build.pages).replace('.pug', '.html');
			fs.unlink(filePathInBuildDir, (err) => {
				if (err) throw err;
				console.log(`---------- Delete:  ${filePathInBuildDir}`);
			});
		});

	// Разметка Блоков: изменение
	watch([`${dir.blocks}**/*.pug`], { events: ['change'], delay: 100 }, series(
		compilePug,
		reload
	));

	// Разметка Блоков: добавление
	watch([`${dir.blocks}**/*.pug`], { events: ['add'], delay: 100 }, series(
		writePugMixinsFile,
		compilePug,
		reload
	));

	// Разметка Блоков: удаление
	watch([`${dir.blocks}**/*.pug`], { events: ['unlink'], delay: 100 }, writePugMixinsFile);

	// Шаблоны pug: все события
	watch([`${dir.dev}pug/**/*.pug`, `!${dir.dev}pug/mixins.pug`], { delay: 100 }, series(
		compilePug,
		parallel(writeSassImportsFile),
		parallel(compileSass),
		reload,
	));

	// Стили Блоков: изменение
	watch([`${dir.blocks}**/*.scss`], { events: ['change'], delay: 100 }, series(
		compileSass,
	));

	// Стили Блоков: добавление
	watch([`${dir.blocks}**/*.scss`], { events: ['add'], delay: 100 }, series(
		writeSassImportsFile,
		compileSass,
	));

	// Стилевые глобальные файлы: все события
	watch([`${dir.dev}scss/**/*.scss`, `!${dir.dev}scss/style.scss`], { events: ['all'], delay: 100 }, series(
		compileSass,
	));

	// Копирование Images
	watch([`${dir.dev}img/**/*.*`], { events: ['all'], delay: 100 }, series(
		copyImg,
		reload,
	));

	// Спрайт SVG
	watch([`${dir.dev}symbols/*.svg`], { events: ['all'], delay: 100 }, series(
		generateSvgSprite,
		reload,
	));

	// Копирование шрифтов
	watch([`${dir.dev}fonts/`], { events: ['all'], delay: 100 }, series(
		copyFonts,
		reload,
	));
}


exports.build = series(
	parallel(clearBuildDir, writePugMixinsFile),
	parallel(compilePugFast, generateSvgSprite),
	parallel(copyFonts, copyImg),
	parallel(writeSassImportsFile),
	parallel(compileSass)
);

exports.default = series(
	parallel(clearBuildDir, writePugMixinsFile),
	parallel(compilePugFast, generateSvgSprite),
	parallel(copyFonts, copyImg),
	parallel(writeSassImportsFile),
	parallel(compileSass),
	serve,
);


// Функции, не являющиеся задачами Gulp ----------------------------------------

/**
 * Получение списка классов из HTML и запись его в глоб. переменную idm.blocksFromHtml.
 * @param  {object}   file Обрабатываемый файл
 * @param  {string}   enc  Кодировка
 * @param  {Function} cb   Коллбэк
 */
function getClassesToBlocksList(file, enc, cb) {
	// Передана херь — выходим
	if (file.isNull()) {
		cb(null, file);
		return;
	}
	// Проверяем, не является ли обрабатываемый файл исключением
	let processThisFile = true;
	idm.config.notGetBlocks.forEach(function(item) {
		if (file.relative.trim() === item.trim()) processThisFile = false;
	});
	// Файл не исключён из обработки, погнали
	if (processThisFile) {
		const fileContent = file.contents.toString();
		let classesInFile = getClassesFromHtml(fileContent);
		// idm.blocksFromHtml = [];
		// Обойдём найденные классы
		for (let item of classesInFile) {
			// Не Блок или этот Блок уже присутствует?
			if ((item.indexOf('__') > -1) || (item.indexOf('_') > -1) || (idm.blocksFromHtml.indexOf(item) + 1)) continue;
			// Класс совпадает с классом-исключением из настроек?
			if (idm.config.ignoredBlocks.indexOf(item) + 1) continue;
			// У этого блока отсутствует папка?
			// if (!fileExist(dir.blocks + item)) continue;
			// Добавляем класс в список
			idm.blocksFromHtml.push(item);
		}
		console.log('---------- Used HTML blocks: ' + idm.blocksFromHtml.join(', '));
		file.contents = new Buffer.from(fileContent);
	}
	this.push(file);
	cb();
}

/**
 * Проверка существования файла или папки
 * @param  {string} path - Путь до файла или папки
 * @return {boolean}
 */
function fileExist(path){
	let flag = true;
	try{
		fs.accessSync(path, fs.F_OK);
	}catch(e){
		flag = false;
	}
	return flag;
}

/**
 * Получение всех названий поддиректорий, содержащих файл указанного расширения, совпадающий по имени с поддиректорией
 * @param  {string} ext    Расширение файлов, которое проверяется
 * @return {array}         Массив из имён блоков
 */
function getDirectories(ext) {
	let source = dir.blocks;
	return fs.readdirSync(source)
		.filter(item => fs.lstatSync(source + item).isDirectory())
		.filter(item => fileExist(source + item + '/' + item + '.' + ext));
}

/**
 * Получение разницы между двумя массивами.
 * @param  {array} a1 Первый массив
 * @param  {array} a2 Второй массив
 * @return {array}    Элементы, которые отличаются
 */
function getArraysDiff(a1, a2) {
	return a1.filter(i=>!a2.includes(i)).concat(a2.filter(i=>!a1.includes(i)))
}
