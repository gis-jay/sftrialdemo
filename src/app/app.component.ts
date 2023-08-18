//Angular Imports
import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';

//ESRI Imports
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import MapImageLayer from "@arcgis/core/layers/MapImageLayer";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import esri = __esri

//Syncfusion Imports
import { DataStateChangeEventArgs, DataResult, PageSettingsModel, InfiniteScrollService, FreezeService, ResizeService } from '@syncfusion/ej2-angular-grids'

//AG-Grid Imports
import { ColDef, IDatasource, IGetRowsParams } from 'ag-grid-community';

//Other Imports
import { Observable, Subject, from } from 'rxjs';
import { SelectEventArgs } from '@syncfusion/ej2-angular-navigations';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [InfiniteScrollService, FreezeService, ResizeService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  title = 'Syncfusion Trial';

  //ESRI Objects
  private _mapUrl:string = "https://arcgisservertest.maine.gov/arcgis/rest/services/mdot/MaineDOT_Dynamic_New/MapServer"
  private _mapView:esri.MapView|null = null
  private _layer:MapImageLayer = new MapImageLayer({url: this._mapUrl})
  public layerNames:Array<string> = [ "Culverts - Cross", "Construction Advertise Plan" ]
  public layers:Array<esri.Sublayer> = []

  //Syncfusion Objects
  public dataSources:Array<FeatureLayerDataSource> = []
  public pageOptions:Array<PageSettingsModel> = []
  public dataSourcesLoaded:boolean = false
  public pageSize:number = 250

  //AG-Grid Objects
  public dataSourcesAG:Array<FeatureLayerAGDataSource> = []
  public gridOptions:any = {
    rowBuffer: 0,
    rowSelection: "single",
    rowModelType: "infinite",
    paginationPageSize: 250,
    cacheOverflowSize: 2,
    maxConcurrentDatasourceRequests: 1,
    infiniteInitialRowCount:1,
    maxBlocksInCache:10
  }

  constructor(private changeDetector:ChangeDetectorRef) {
    //@ts-expect-error
    window['app'] = this
  }

  loadMap() {
    this._layer = new MapImageLayer({url: this._mapUrl})
    let map:esri.Map = new Map({
      layers: [this._layer]
    })
    this._mapView = new MapView({
      container:"mapDiv",
      map: map,
      ui: {
        components: []
      }
    })

    this._mapView.when(async () => {
      this.layerNames.forEach((name:string) => {
        let layer:esri.Sublayer = this._layer.allSublayers.find((l:esri.Sublayer) => {return l.title === name })
        if(layer) {
          this.layers.push(layer)
          this.dataSources.push(new FeatureLayerDataSource(new FeatureLayer({url:layer.url}), `${name} (Syncfusion)`))
          this.dataSourcesAG.push(new FeatureLayerAGDataSource(new FeatureLayer({url:layer.url}), `${name} (AG-Grid)`))
        }
      })

      let promises:Array<Promise<void>> = []

      this.dataSources.forEach(async (dataSource:FeatureLayerDataSource) => {
        promises.push(dataSource.init())
      })

      this.dataSourcesAG.forEach(async (dataSource:FeatureLayerAGDataSource) => {
        promises.push(dataSource.init())
      })

      Promise.all(promises).then(() => {
        this.dataSources.forEach((dataSource:FeatureLayerDataSource) => {
          this.pageOptions.push({
            pageSize: this.pageSize,
            pageCount: Math.ceil(dataSource.count/this.pageSize)
          })
        })
        this.dataSourcesLoaded = true
        this.changeDetector.markForCheck()
      })
    })
  }

  public dataStateChange(state: DataStateChangeEventArgs, index:number): void {
    this.dataSources[index].getRows(state.skip??0, state.take??10)
  }

  public loadFirstDataSource() {
    if(this.dataSources.length) {
      this.dataSources[0].getRows(0, this.pageSize)
    }
  }

  public onTabSelected(args:SelectEventArgs) {
    let index:number = args.selectedIndex
    if(this.dataSources.length && index < this.dataSources.length) {
      let dataSource:FeatureLayerDataSource = this.dataSources[args.selectedIndex]
      if(!dataSource.initialDataLoaded) {
        dataSource.getRows(0, this.pageSize)
      }
    }
    else {
      //AG-Grid automatically loads the first page of data...
    }
  }
}

//Syncfusion Data Source
class FeatureLayerDataSource extends Subject<DataResult> {
  count:number = 0
  columns:Array<esri.Field> = []
  initialDataLoaded:boolean = false

  constructor(public layer:esri.FeatureLayer, public name:string) {
    super()
  }

  async init() {
    this.count = await this.layer.queryFeatureCount({
      where: "1=1"
    }).catch((err) => {
      console.error('Error getting feature count', err)
      return -1
    })
    this.columns = this.layer.fields
  }

  public getRows(start:number, offset:number):void {
    this.initialDataLoaded = true
    this._getRows(start, offset).subscribe((v) => super.next(v))
  }

  private _getRows(start:number, offset:number):Observable<DataResult> {
    return from(new Promise(async (resolve, reject) => {
      this.layer.queryFeatures({
        start:start,
        num: offset,
        outFields: ["*"],
        returnGeometry: true,
        where: "1=1"
      }).then((featureSet:esri.FeatureSet) => {
        resolve({
          result:featureSet.features.map((graphic:esri.Graphic) => graphic.attributes),
          count: this.count
        })
      }).catch((err) => {
        console.error('Error getting features', err)
        reject(err)
      })
    })) as Observable<DataResult>
  }
}

//AG-Grid Data Source
class FeatureLayerAGDataSource implements IDatasource {
  count:number = 0
  columns:Array<ColDef> = []
  initialDataLoaded:boolean = false
  rowCount?: number | undefined;

  constructor(public layer:esri.FeatureLayer, public name:string) {
    
  }

  async init() {
    this.count = await this.layer.queryFeatureCount({
      where: "1=1"
    }).catch((err) => {
      console.error('Error getting feature count', err)
      return -1
    })
    this.rowCount = this.count

    let columns:Array<ColDef> = []
    this.layer.fields.forEach((field:esri.Field, index:number) => {
      let column:ColDef = {
          headerName: field.alias,
          field: field.name,
          sortable: true,
          resizable: true
      }
      if(index === 0) {
          column.pinned = "left"
      }
      columns.push(column)
    })
    this.columns = columns
  }

  public getRows(params:IGetRowsParams):void {
    this.initialDataLoaded = true

    let start:number = params.startRow
    let offset:number = params.endRow - start

    this.layer.queryFeatures({
      start:start,
      num: offset,
      outFields: ["*"],
      returnGeometry: true,
      where: "1=1"
    }).then((featureSet:esri.FeatureSet) => {
      let totalRowCount:number = this.rowCount??-1
      let rowCount:number|undefined = (totalRowCount > 0 && params.endRow >= totalRowCount) ? this.rowCount : undefined
      params.successCallback(featureSet.features.map((graphic:esri.Graphic) => graphic.attributes), rowCount)
    }).catch((err) => {
      console.error('Error getting features', err)
      params.failCallback()
    })
  }
}
