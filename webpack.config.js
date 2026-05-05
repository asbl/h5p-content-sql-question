const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = (nodeEnv === 'production');

module.exports = {
  experiments: {
    asyncWebAssembly: true,
  },
  mode: nodeEnv,
  resolve: {
    fallback: {
      'fs': false,
      'tls': false,
      'net': false,
      'path': false,
      'zlib': false,
      'http': false,
      'https': false,
      'stream': false,
      'crypto': false,
    } 
  },
  optimization: {
    minimize: isProd,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress:{
            drop_console: isProd,
          }
        }
      }),
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'h5p-sql-question.css'
    })
  ],
  entry: {
    dist: './src/entries/h5p-sql-question.js'
  },
  output: {
    filename: 'h5p-sql-question.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  target: ['web', 'es5'], // IE11
  module: {
    rules: [
      
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader'
      },
      
      {
        test: /\.(s[ac]ss|css)$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              publicPath: ''
            }
          },
          { loader: 'css-loader' },
          {
            loader: 'sass-loader'
          }
        ]
      },
      {
        test: /\.svg|\.jpg|\.png$/,
        include: path.join(__dirname, 'src/images'),
        type: 'asset/resource'
      },
      {
        test: /\.woff$/,
        include: path.join(__dirname, 'src/fonts'),
        type: 'asset/resource'
      },
      {
        test: /\.wasm$/,
        type: 'asset/inline',
      },
      {
        test: /\.db$/,
        include: path.join(__dirname, 'src/scripts/databases'),
        type: 'asset/resource',
        generator: {
          filename: 'databases/[name][ext]'
        }
      }
    ]
  },
  stats: {
    colors: true
  },
  devtool: (isProd) ? undefined : 'eval-cheap-module-source-map'
};
